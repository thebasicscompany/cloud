import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

/**
 * Agent overview — the live read model for the Basichome "Agent" surface: the
 * skills the cloud worker has learned, agent-authored helper modules,
 * managed-browser cookie sessions, Composio / direct-auth credentials, and the
 * derived metrics shown across the console.
 *
 * Ported from the web data lib `web/src/lib/agent-data.ts`, but scoped to the
 * VERIFIED workspace JWT (`c.var.workspace.workspace_id`) instead of a
 * service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID. Each token only
 * ever reads its own workspace's agent state — so this can power the renderer
 * directly (no admin key on the client, no cross-workspace leak).
 *
 * Privacy boundary (matches the source lib): cookie blobs
 * (`workspace_browser_sites.storage_state_json`), credential secret material
 * (`workspace_credentials.ciphertext`), and API-key hashes are NEVER selected,
 * so they can never reach the renderer.
 *
 *   GET /v1/agent → AgentData (skills, helpers, browserSessions, connections,
 *                              toolkits, metrics)
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const agentRoute = new Hono<{ Variables: Vars }>()

interface AgentSkill {
  id: string
  name: string
  description: string | null
  kind: string | null
  host: string | null
  scope: string | null
  confidence: number | null
  active: boolean
  pendingReview: boolean
  requiresIntegrations: string[]
  createdAt: string | null
}

interface AgentHelper {
  id: string
  name: string
  description: string | null
  version: number | null
  active: boolean
  createdAt: string | null
}

interface BrowserSession {
  host: string
  displayName: string | null
  capturedVia: string | null
  lastVerifiedAt: string | null
  expiresAt: string | null
  createdAt: string | null
}

interface AgentConnection {
  id: string
  label: string | null
  kind: string | null
  provenance: string | null
  status: string | null
  lastUsedAt: string | null
  lastError: string | null
}

interface ComposioToolkit {
  toolkitSlug: string
  schemaVersion: number | null
  toolCount: number
  fetchedAt: string | null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

agentRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const supabase = supabaseAdmin()

  // Every read is scoped to the caller's workspace — this is what makes "each
  // workspace has its own context and skills" real. Built per-query (the
  // Postgrest builder type is too deep for a shared generic helper).
  const [
    skillsRes,
    helpersRes,
    sitesRes,
    credsRes,
    toolkitsRes,
    totalSessionsRes,
    activeSessionsRes,
  ] = await Promise.all([
    supabase
      .from('cloud_skills')
      .select(
        'id,name,description,kind,host,scope,confidence,active,pending_review,requires_integrations,created_at',
      )
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('cloud_agent_helpers')
      .select('id,name,description,helper_version,active,created_at')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(100),
    // storage_state_json (cookies) intentionally NOT selected.
    supabase
      .from('workspace_browser_sites')
      .select('host,display_name,captured_via,last_verified_at,expires_at,created_at')
      .eq('workspace_id', ws)
      .order('last_verified_at', { ascending: false })
      .limit(100),
    // ciphertext (secret material) intentionally NOT selected.
    supabase
      .from('workspace_credentials')
      .select('id,label,kind,provenance,status,last_used_at,last_provider_error,created_at')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('composio_tool_cache')
      .select('toolkit_slug,schema_version,tools_json,fetched_at')
      .eq('workspace_id', ws)
      .order('fetched_at', { ascending: false })
      .limit(50),
    supabase
      .from('cloud_session_bindings')
      .select('session_id', { count: 'exact', head: true })
      .eq('workspace_id', ws),
    supabase
      .from('cloud_session_bindings')
      .select('session_id', { count: 'exact', head: true })
      .eq('workspace_id', ws)
      .is('ended_at', null),
  ])

  const skills: AgentSkill[] = (skillsRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    kind: (r.kind as string) ?? null,
    host: (r.host as string) ?? null,
    scope: (r.scope as string) ?? null,
    confidence: (r.confidence as number) ?? null,
    active: Boolean(r.active),
    pendingReview: Boolean(r.pending_review),
    requiresIntegrations: asStringArray(r.requires_integrations),
    createdAt: (r.created_at as string) ?? null,
  }))

  const helpers: AgentHelper[] = (helpersRes.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    version: (r.helper_version as number) ?? null,
    active: Boolean(r.active),
    createdAt: (r.created_at as string) ?? null,
  }))

  const browserSessions: BrowserSession[] = (sitesRes.data ?? []).map((r) => ({
    host: r.host as string,
    displayName: (r.display_name as string) ?? null,
    capturedVia: (r.captured_via as string) ?? null,
    lastVerifiedAt: (r.last_verified_at as string) ?? null,
    expiresAt: (r.expires_at as string) ?? null,
    createdAt: (r.created_at as string) ?? null,
  }))

  const connections: AgentConnection[] = (credsRes.data ?? []).map((r) => ({
    id: r.id as string,
    label: (r.label as string) ?? null,
    kind: (r.kind as string) ?? null,
    provenance: (r.provenance as string) ?? null,
    status: (r.status as string) ?? null,
    lastUsedAt: (r.last_used_at as string) ?? null,
    lastError: (r.last_provider_error as string) ?? null,
  }))

  const toolkits: ComposioToolkit[] = (toolkitsRes.data ?? []).map((r) => ({
    toolkitSlug: r.toolkit_slug as string,
    schemaVersion: (r.schema_version as number) ?? null,
    toolCount: Array.isArray(r.tools_json) ? r.tools_json.length : 0,
    fetchedAt: (r.fetched_at as string) ?? null,
  }))

  const connectedCount = connections.filter(
    (conn) =>
      (conn.status ?? '').toLowerCase() === 'connected' ||
      (conn.status ?? '').toLowerCase() === 'active',
  ).length

  return c.json({
    configured: true,
    workspaceId: ws,
    skills,
    helpers,
    browserSessions,
    connections,
    toolkits,
    metrics: {
      skills: skills.length,
      pendingSkills: skills.filter((s) => s.pendingReview).length,
      helpers: helpers.length,
      browserSites: browserSessions.length,
      activeSessions: activeSessionsRes.count ?? 0,
      totalSessions: totalSessionsRes.count ?? 0,
      connections: connections.length,
      connectedCount,
      toolkits: toolkits.length,
    },
  })
})
