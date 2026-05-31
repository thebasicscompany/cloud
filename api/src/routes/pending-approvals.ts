import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

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
  agent_run_id: string | null
  action_name: string | null
  payload: Record<string, unknown> | null
  preview_text: string | null
  created_at: string
  resolved_at: string | null
  decided_at: string | null
  decision: string | null
  expires_at: string | null
}

function mapRow(r: PendingRow): Record<string, unknown> {
  const action = r.action_name ?? 'agent action'
  const decision = (r.decision ?? '').toLowerCase()
  const expired = r.expires_at ? new Date(r.expires_at).getTime() < Date.now() : false
  const status = decision
    ? decision.startsWith('approve')
      ? 'approved'
      : decision.startsWith('reject')
        ? 'rejected'
        : decision.includes('change')
          ? 'changes_requested'
          : 'approved'
    : expired
      ? 'expired'
      : 'pending'
  // Surface the payload's top-level keys as the "requested access" chips.
  const requestedAccess: string[] = Object.keys(r.payload ?? {}).slice(0, 6)

  return {
    id: r.id,
    kind: 'cloud_run',
    status,
    risk: riskFor(action),
    objectName: action,
    reason: r.preview_text ?? `The agent needs approval to run ${action}.`,
    requestedAt: r.created_at,
    resolvedAt: r.resolved_at ?? r.decided_at ?? undefined,
    requestedBy: { id: r.agent_run_id ?? 'agent', name: 'Agent run', roles: ['device_owner'] },
    requiredRole: 'admin',
    rolloutTarget: 'cloud',
    requestedAccess,
    checks: [],
    runId: r.agent_run_id ?? undefined,
  }
}

pendingApprovalsRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const { data } = await supabaseAdmin()
    .from('pending_approvals')
    .select(
      'id,agent_run_id,action_name,payload,preview_text,created_at,resolved_at,decided_at,decision,expires_at',
    )
    .eq('workspace_id', ws)
    .order('created_at', { ascending: false })
    .limit(100)
  const approvals = ((data ?? []) as PendingRow[]).map((r) => mapRow(r))
  return c.json({ approvals, trustGrants: [] })
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

  const { data, error } = await supabaseAdmin()
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
