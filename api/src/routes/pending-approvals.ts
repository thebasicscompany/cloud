import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'
import { logger } from '../middleware/logger.js'

/**
 * Channel name the worker's approval gate LISTENs on
 * (see worker/src/approvals/await.ts:179). Must match `channelFor` exactly —
 * just `approval_<id_underscored>`. Without firing pg_notify on this channel
 * after a UI approval, the worker keeps blocking on LISTEN and the run never
 * resumes even though the row is `status='approved'`.
 */
function approvalChannel(approvalId: string): string {
  return `approval_${approvalId.replace(/-/g, '_')}`
}

/**
 * Pending approvals — the worker writes a `pending_approvals` row when a tool
 * call pauses for a human decision. The rich `WorkspaceApproval` UI shape is
 * filled from the leaner real row with sensible defaults so the existing
 * renderer components show real data.
 *
 * Ported from the web data lib `web/src/lib/approvals-data.ts`, but scoped to
 * the VERIFIED workspace JWT (`c.var.workspace.workspace_id`) instead of a
 * service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID. Each token only
 * ever reads its own workspace's approvals.
 *
 * NOTE: This reads the `pending_approvals` table — distinct from the `approvals`
 * table served by `approvals.ts` at /v1/approvals. Mounted at a separate path
 * (`/v1/pending-approvals`) to avoid colliding with that route.
 *
 *   GET /v1/pending-approvals → { approvals: WorkspaceApproval[], trustGrants: [] }
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const pendingApprovalsRoute = new Hono<{ Variables: Vars }>()

const DESTRUCTIVE_RE = /_(delete|remove|drop|purge|send|wipe)_|^bash$/i

function riskFor(action: string): string {
  return DESTRUCTIVE_RE.test(action) ? 'high' : 'medium'
}

interface PendingRow {
  id: string
  // The worker writes to the `approvals` table with `run_id`, the older legacy
  // surface was `pending_approvals.agent_run_id` — accept either so this route
  // can read both during the migration.
  agent_run_id?: string | null
  run_id?: string | null
  // `action_name` (legacy) ≈ `tool_name` (new). Same idea, different column.
  action_name?: string | null
  tool_name?: string | null
  // `payload` (legacy) ≈ `args_preview` (new).
  payload?: Record<string, unknown> | null
  args_preview?: Record<string, unknown> | null
  // `preview_text` (legacy) ≈ `reason` (new).
  preview_text?: string | null
  reason?: string | null
  created_at: string
  resolved_at?: string | null
  decided_at: string | null
  // `decision` (legacy free-text) ≈ `status` (new enum: 'pending'|'approved'|'denied'|'expired').
  decision?: string | null
  status?: string | null
  expires_at: string | null
}

function mapRow(r: PendingRow): Record<string, unknown> {
  const action = r.tool_name ?? r.action_name ?? 'agent action'
  const runId = r.run_id ?? r.agent_run_id ?? null
  const payload = r.args_preview ?? r.payload ?? null
  // Worker writes the new `status` enum directly ('pending'|'approved'|'denied'|
  // 'expired'); the legacy `decision` column is free-text. Prefer status, fall
  // back to decision parsing.
  const rawStatus = (r.status ?? r.decision ?? '').toLowerCase()
  const expired = r.expires_at ? new Date(r.expires_at).getTime() < Date.now() : false
  const status = rawStatus === 'pending' || rawStatus === ''
    ? (expired ? 'expired' : 'pending')
    : rawStatus.startsWith('approve')
      ? 'approved'
      : rawStatus.startsWith('reject') || rawStatus.startsWith('den')
        ? 'rejected'
        : rawStatus.includes('change')
          ? 'changes_requested'
          : rawStatus === 'expired'
            ? 'expired'
            : 'pending'
  // Surface the payload's top-level keys as the "requested access" chips.
  const requestedAccess: string[] = Object.keys(payload ?? {}).slice(0, 6)

  return {
    id: r.id,
    kind: 'cloud_run',
    status,
    risk: riskFor(action),
    objectName: action,
    reason: r.reason ?? r.preview_text ?? `The agent needs approval to run ${action}.`,
    requestedAt: r.created_at,
    resolvedAt: r.resolved_at ?? r.decided_at ?? undefined,
    requestedBy: { id: runId ?? 'agent', name: 'Agent run', roles: ['device_owner'] },
    requiredRole: 'admin',
    rolloutTarget: 'cloud',
    requestedAccess,
    checks: [],
    runId: runId ?? undefined,
  }
}

pendingApprovalsRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  // Read from BOTH the canonical `approvals` table (where the worker writes
  // today) AND the legacy `pending_approvals` table (older rows that haven't
  // been migrated). Merge by id with `approvals` winning — they're the source
  // of truth during the transition. Returning both means existing pending rows
  // surface on /approvals regardless of which writer produced them.
  const admin = supabaseAdmin()
  const [canonical, legacy] = await Promise.all([
    admin
      .from('approvals')
      .select(
        'id,run_id,tool_name,args_preview,reason,status,created_at,decided_at,expires_at',
      )
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('pending_approvals')
      .select(
        'id,agent_run_id,action_name,payload,preview_text,created_at,resolved_at,decided_at,decision,expires_at',
      )
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  const seen = new Set<string>()
  const merged: Record<string, unknown>[] = []
  for (const r of (canonical.data ?? []) as PendingRow[]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    merged.push(mapRow(r))
  }
  for (const r of (legacy.data ?? []) as PendingRow[]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    merged.push(mapRow(r))
  }
  return c.json({ approvals: merged, trustGrants: [] })
})

/**
 * POST /v1/pending-approvals/:id — decide a pending approval.
 *
 * Ported verbatim from the web mutation route `web/src/app/api/approvals/[id]`
 * (which used the service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID),
 * now scoped to the VERIFIED workspace JWT (`c.var.workspace.workspace_id`).
 *
 * Writes `decision` + `decision_payload` + `resolved_at`/`decided_at` on the
 * `pending_approvals` row. The worker's approval gate polls that row and resumes
 * (approve) or aborts (anything else) the paused tool call within its poll
 * interval (~2s). The `.is('resolved_at', null)` guard keeps the decision
 * idempotent — a second POST for an already-resolved row returns 404.
 *
 * Body: `{ decision }` — the already-mapped DB value (the web route maps its
 * `action` → decision before calling; the API stores it as-is so the external
 * contract is identical).
 */
const DecideSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'changes_requested']),
  reason: z.string().max(4000).nullable().optional(),
})

pendingApprovalsRoute.post('/:id', requireWorkspaceJwt, zValidator('json', DecideSchema), async (c) => {
  const ws = c.var.workspace.workspace_id
  const id = c.req.param('id')
  const { decision, reason } = c.req.valid('json')
  const now = new Date().toISOString()
  const admin = supabaseAdmin()

  // Try the canonical `approvals` table first (where the worker writes today).
  // It uses `status` ('approved'|'denied') instead of legacy `decision`.
  // NOTE: `decided_via` has a CHECK constraint and 'workspace_jwt' is NOT in
  // the allowed set — using 'signed_token' (same value the /v1/approvals POST
  // route uses) so the UPDATE actually lands. The earlier silent failure
  // (data null, no row matched) looked identical to "row not found" and made
  // the UI button 404 even after deploying this code. Capture the error
  // explicitly so the next constraint addition surfaces in logs.
  const canonicalStatus = decision === 'approved' ? 'approved' : 'denied'
  const { data: canonicalRow, error: canonicalErr } = await admin
    .from('approvals')
    .update({
      status: canonicalStatus,
      decided_at: now,
      decided_via: 'signed_token',
    })
    .eq('id', id)
    .eq('workspace_id', ws)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (canonicalErr) {
    logger.error(
      { id, err: canonicalErr.message },
      'approvals: canonical update failed',
    )
  }
  if (canonicalRow) {
    // Fire the wake-up NOTIFY so the worker's LISTEN handler at
    // worker/src/approvals/await.ts:179 re-reads the row's status. Without
    // this the row is `approved` in the DB but the run keeps blocking — the
    // bug that left 2a009d23-… stuck on 2026-06-02 even after the UI button
    // returned success.
    const channel = approvalChannel(id)
    const payload = JSON.stringify({ id, status: canonicalStatus, kind: 'decision', via: 'workspace_jwt' })
    try {
      await db.execute(sql`SELECT pg_notify(${channel}, ${payload})`)
    } catch (e) {
      logger.error(
        { id, channel, err: (e as Error).message },
        'approvals: pg_notify after UPDATE failed',
      )
    }
    return c.json({ ok: true, id, decision })
  }

  // Fall back to the legacy `pending_approvals` table for rows that haven't
  // been migrated. Same idempotency guard (`resolved_at IS NULL`).
  const { data, error } = await admin
    .from('pending_approvals')
    .update({
      decision,
      decision_payload: reason ? { reason } : null,
      resolved_at: now,
      decided_at: now,
    })
    .eq('id', id)
    .eq('workspace_id', ws)
    .is('resolved_at', null)
    .select('id')
    .maybeSingle()

  if (error) return c.json({ error: error.message }, 500)
  if (!data) return c.json({ error: 'not_found_or_already_resolved' }, 404)
  return c.json({ ok: true, id, decision })
})
