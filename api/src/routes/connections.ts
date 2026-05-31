import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

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
