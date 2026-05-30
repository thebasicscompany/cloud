import { Hono } from 'hono'

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
