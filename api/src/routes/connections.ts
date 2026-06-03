import { Hono } from 'hono'

import { ComposioClient } from '@basics/shared'
import { loadConnectedAccountByToolkit } from '../lib/automation-trigger-registry.js'
import { logger } from '../middleware/logger.js'
import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'
import { requireRole } from '../middleware/role.js'

/**
 * Workspace connections — the read model for the Connections surface: the
 * Composio toolkit cache, stored workspace credentials, and saved browser-login
 * sites.
 *
 * Ported from the web data lib `web/src/lib/connections-data.ts`, but scoped to
 * the VERIFIED workspace JWT (`c.var.workspace.workspace_id`) instead of a
 * service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID. Each token only
 * ever reads its own workspace's connections — so this can power the renderer
 * directly (no admin key on the client, no cross-workspace leak).
 *
 * Secret material is NEVER selected: `workspace_credentials.ciphertext` (the
 * encrypted secret) and `workspace_browser_sites.storage_state_json` (the saved
 * cookies / storage state) are excluded at the query level so they can never
 * reach a client.
 *
 *   GET /v1/connections → { workspaceId, toolkits, credentials, browserSites }
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const connectionsRoute = new Hono<{ Variables: Vars }>()

interface ConnectionToolkit {
  /** Composio toolkit slug (e.g. "gmail", "googlecalendar"). */
  slug: string
  schemaVersion: number | null
  fetchedAt: string | null
}

interface ConnectionCredential {
  id: string
  /** Provider family — e.g. "gmail", "anthropic". */
  kind: string
  label: string | null
  /** Where the credential came from — e.g. "basics_managed", "byok". */
  provenance: string | null
  /** e.g. "active", "expired", "not_provisioned", "revoked". */
  status: string | null
  lastUsedAt: string | null
  /** Most recent provider-side error message (already redacted upstream). */
  lastProviderError: string | null
}

interface ConnectionBrowserSite {
  host: string
  displayName: string | null
  lastVerifiedAt: string | null
  expiresAt: string | null
}

connectionsRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const supabase = supabaseAdmin()

  const [toolkitsRes, credsRes, sitesRes] = await Promise.all([
    supabase
      .from('composio_tool_cache')
      .select('toolkit_slug,schema_version,fetched_at')
      .eq('workspace_id', ws)
      .order('toolkit_slug', { ascending: true }),
    // NEVER select `ciphertext` (the encrypted secret material).
    supabase
      .from('workspace_credentials')
      .select('id,kind,label,provenance,status,last_used_at,last_provider_error')
      .eq('workspace_id', ws)
      .order('kind', { ascending: true }),
    // NEVER select `storage_state_json` (the saved cookies / storage state).
    supabase
      .from('workspace_browser_sites')
      .select('host,display_name,last_verified_at,expires_at')
      .eq('workspace_id', ws)
      .order('host', { ascending: true }),
  ])

  const toolkits: ConnectionToolkit[] = (toolkitsRes.data ?? []).map((t) => ({
    slug: t.toolkit_slug as string,
    schemaVersion: (t.schema_version as number) ?? null,
    fetchedAt: (t.fetched_at as string) ?? null,
  }))

  const credentials: ConnectionCredential[] = (credsRes.data ?? []).map((cred) => ({
    id: cred.id as string,
    kind: (cred.kind as string) ?? 'unknown',
    label: (cred.label as string) ?? null,
    provenance: (cred.provenance as string) ?? null,
    status: (cred.status as string) ?? null,
    lastUsedAt: (cred.last_used_at as string) ?? null,
    lastProviderError: (cred.last_provider_error as string) ?? null,
  }))

  const browserSites: ConnectionBrowserSite[] = (sitesRes.data ?? []).map((s) => ({
    host: s.host as string,
    displayName: (s.display_name as string) ?? null,
    lastVerifiedAt: (s.last_verified_at as string) ?? null,
    expiresAt: (s.expires_at as string) ?? null,
  }))

  return c.json({ workspaceId: ws, toolkits, credentials, browserSites })
})

// ─── DELETE /v1/connections/:slug ────────────────────────────────────────
//
// Disconnect a workspace's connection to a Composio toolkit (e.g. "notion").
// Does two things in order:
//   1. Revoke the OAuth connection on the Composio side via
//      ComposioClient.deleteConnectedAccount(connectedAccountId) — looked up
//      from the live Composio account list by toolkit slug.
//   2. Drop the cached toolkit row from composio_tool_cache so it disappears
//      from the Connections page immediately (the cache repopulates only when
//      a fresh connection is made).
//
// If the Composio side has no matching active account (already revoked
// upstream), we still clear the local cache — the user clicked "Disconnect"
// and the UI should reflect that. We return ok: true with `composioRevoked:
// false` so the caller can tell the difference.

const SLUG_RE = /^[a-z0-9_-]{1,80}$/

// Disconnecting an app affects every member of the workspace — gate to
// admin/owner so a viewer (or a hostile member) can't strip an integration
// the whole team depends on.
connectionsRoute.delete('/:slug', requireWorkspaceJwt, requireRole('admin'), async (c) => {
  const slug = (c.req.param('slug') ?? '').trim().toLowerCase()
  if (!SLUG_RE.test(slug)) return c.json({ error: 'invalid_slug' }, 400)
  const ws = c.var.workspace.workspace_id
  const acc = c.var.workspace.account_id

  // Find the connected_account for this toolkit. composio_user_id convention
  // is account_id (per loadConnectedAccountByToolkit).
  const byToolkit = await loadConnectedAccountByToolkit(ws, acc)
  const connectedAccountId = byToolkit[slug] ?? null

  let composioRevoked = false
  if (connectedAccountId) {
    try {
      const client = new ComposioClient()
      await client.deleteConnectedAccount(connectedAccountId)
      composioRevoked = true
    } catch (err) {
      logger.warn(
        { workspaceId: ws, slug, connectedAccountId, err: (err as Error).message },
        'connections delete: composio deleteConnectedAccount failed; clearing local cache anyway',
      )
    }
  }

  // Drop the cached toolkit row so the UI reflects the disconnect even when
  // Composio was already revoked / unreachable. Tool cache is workspace-scoped.
  try {
    const supabase = supabaseAdmin()
    await supabase
      .from('composio_tool_cache')
      .delete()
      .eq('workspace_id', ws)
      .eq('toolkit_slug', slug)
  } catch (err) {
    logger.warn(
      { workspaceId: ws, slug, err: (err as Error).message },
      'connections delete: tool_cache row removal failed (non-fatal)',
    )
  }

  return c.json({ ok: true, slug, composioRevoked })
})
