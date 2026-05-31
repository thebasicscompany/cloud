import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

/**
 * Workspace settings — the read model behind Settings (workspace + members,
 * trust rules, developer API keys). Ported from the web data lib
 * `web/src/lib/settings-data.ts`, but scoped to the VERIFIED workspace JWT
 * (`c.var.workspace.workspace_id`) instead of a service-role admin client + a
 * hardcoded PRIMARY_WORKSPACE_ID. Every query filters by the caller's workspace
 * so any member JWT only ever reads its own workspace's settings.
 *
 * These reads are member-safe (NOT admin-gated): they expose only
 * non-secret metadata. API-key secret columns (hashes / ciphertext) are NEVER
 * selected — only id/name/prefix/created_at/last_used_at.
 *
 *   GET /v1/settings/workspace  → { workspace: WorkspaceSummary, members: WorkspaceMember[] }
 *   GET /v1/settings/trust      → { grants: TrustGrant[] }
 *   GET /v1/settings/developer  → { tokens: ApiToken[], webhooks: [] }
 *
 * Integrations settings stay in the web lib (derived from connections) and are
 * intentionally not ported here.
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const workspaceSettingsRoute = new Hono<{ Variables: Vars }>()

type WorkspaceRole = 'owner' | 'admin' | 'member'

function mapRole(role: string | null): WorkspaceRole {
  return role === 'owner' || role === 'admin' || role === 'member' ? role : 'member'
}

/**
 * GET /workspace — the workspaces row + workspace_members joined to accounts,
 * shaped into { workspace: WorkspaceSummary, members: WorkspaceMember[] }.
 * Mirrors web `getWorkspaceSettings` verbatim (PRIMARY → caller's workspace).
 */
workspaceSettingsRoute.get('/workspace', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const supabase = supabaseAdmin()

  const { data: wsRow } = await supabase
    .from('workspaces')
    .select('id,name,slug,type,created_at')
    .eq('id', ws)
    .maybeSingle()
  if (!wsRow) return c.json({ workspace: null, members: [] }, 404)

  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('id,role,seat_status,joined_at,account_id,accounts(email,display_name)')
    .eq('workspace_id', ws)
    .order('joined_at', { ascending: true })

  const members = (memberRows ?? []).map((m) => {
    const acct = (m as { accounts?: { email?: string; display_name?: string } }).accounts ?? {}
    return {
      id: m.id as string,
      displayName: acct.display_name || acct.email || 'Member',
      email: acct.email || '—',
      role: mapRole(m.role as string),
      joinedAt: (m.joined_at as string) ?? (wsRow.created_at as string),
    }
  })

  const workspace = {
    id: wsRow.id as string,
    name: (wsRow.name as string) ?? 'Workspace',
    slug: (wsRow.slug as string) ?? '',
    billing: {
      // No billing system — honest placeholders; the view hides this card.
      planName: ((wsRow.type as string) ?? 'self_hosted').replaceAll('_', ' '),
      seatsIncluded: members.length,
      seatsUsed: members.length,
      renewsAt: '',
      paymentMethodSummary: 'Not billed',
    },
  }

  return c.json({ workspace, members })
})

/**
 * GET /trust — scoped autonomy rules from workspace_rules. Mirrors web
 * `getTrustSettings` verbatim (PRIMARY → caller's workspace).
 */
workspaceSettingsRoute.get('/trust', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const { data } = await supabaseAdmin().from('workspace_rules').select('*').eq('workspace_id', ws)
  const grants = (data ?? []).map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: String(row.id),
      actionPattern: String(row.action_pattern ?? row.pattern ?? row.name ?? '—'),
      paramsConstraint: String(row.params_constraint ?? row.constraint ?? ''),
      scope: 'workspace' as const,
      grantedByName: '—',
      grantedAt: String(row.created_at ?? ''),
    }
  })
  return c.json({ grants })
})

/**
 * GET /developer — workspace API keys (non-secret metadata only). Mirrors web
 * `getDeveloperSettings` verbatim (PRIMARY → caller's workspace). Secret columns
 * (key hashes / ciphertext) are NEVER selected. Webhooks are not yet a real
 * surface → empty.
 */
workspaceSettingsRoute.get('/developer', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const { data } = await supabaseAdmin()
    .from('workspace_api_keys')
    .select('id,name,prefix,created_at,last_used_at,status,revoked_at')
    .eq('workspace_id', ws)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  const tokens = (data ?? []).map((k) => ({
    id: k.id as string,
    label: (k.name as string) ?? 'API key',
    prefix: (k.prefix as string) ?? 'bk_',
    createdAt: (k.created_at as string) ?? '',
    lastUsedAt: (k.last_used_at as string) ?? undefined,
  }))
  return c.json({ tokens, webhooks: [] })
})
