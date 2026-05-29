import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Live read model for the Basichome "Agent" surface.
 *
 * Reads the real data the opencode self-healing cloud worker writes to the
 * Basics Supabase project: skills it has learned, agent-authored helper
 * modules, managed-browser cookie sessions, and Composio / direct-auth
 * credentials. Privacy boundary: cookie blobs (storage_state_json) and
 * credential secrets (ciphertext) are NEVER selected, so they can never reach
 * the renderer.
 */

export interface AgentSkill {
  id: string;
  name: string;
  description: string | null;
  kind: string | null;
  host: string | null;
  scope: string | null;
  confidence: number | null;
  active: boolean;
  pendingReview: boolean;
  requiresIntegrations: string[];
  createdAt: string | null;
}

export interface AgentHelper {
  id: string;
  name: string;
  description: string | null;
  version: number | null;
  active: boolean;
  createdAt: string | null;
}

export interface BrowserSession {
  host: string;
  displayName: string | null;
  capturedVia: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface AgentConnection {
  id: string;
  label: string | null;
  kind: string | null;
  provenance: string | null;
  status: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
}

export interface ComposioToolkit {
  toolkitSlug: string;
  schemaVersion: number | null;
  toolCount: number;
  fetchedAt: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string | null;
  type: string | null;
  skills: number;
  runs: number;
  members: number;
}

export interface AgentData {
  configured: boolean;
  workspaceId: string | null;
  skills: AgentSkill[];
  helpers: AgentHelper[];
  browserSessions: BrowserSession[];
  connections: AgentConnection[];
  toolkits: ComposioToolkit[];
  metrics: {
    skills: number;
    pendingSkills: number;
    helpers: number;
    browserSites: number;
    activeSessions: number;
    totalSessions: number;
    connections: number;
    connectedCount: number;
    toolkits: number;
  };
}

const EMPTY: AgentData = {
  configured: false,
  workspaceId: null,
  skills: [],
  helpers: [],
  browserSessions: [],
  connections: [],
  toolkits: [],
  metrics: {
    skills: 0,
    pendingSkills: 0,
    helpers: 0,
    browserSites: 0,
    activeSessions: 0,
    totalSessions: 0,
    connections: 0,
    connectedCount: 0,
    toolkits: 0,
  },
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export async function getAgentData(workspaceId?: string): Promise<AgentData> {
  const supabase = getAdminClient();
  if (!supabase) return EMPTY;

  // Optionally scope every read to one workspace — this is what makes "each
  // workspace has its own context and skills" real. Built per-query (the
  // Postgrest builder type is too deep for a shared generic helper).
  const skillsBase = supabase
    .from("cloud_skills")
    .select(
      "id,name,description,kind,host,scope,confidence,active,pending_review,requires_integrations,created_at",
    );
  const helpersBase = supabase
    .from("cloud_agent_helpers")
    .select("id,name,description,helper_version,active,created_at");
  // storage_state_json (cookies) intentionally NOT selected.
  const sitesBase = supabase
    .from("workspace_browser_sites")
    .select("host,display_name,captured_via,last_verified_at,expires_at,created_at");
  // ciphertext (secret material) intentionally NOT selected.
  const credsBase = supabase
    .from("workspace_credentials")
    .select("id,label,kind,provenance,status,last_used_at,last_provider_error,created_at");
  const toolkitsBase = supabase
    .from("composio_tool_cache")
    .select("toolkit_slug,schema_version,tools_json,fetched_at");
  const totalSessBase = supabase
    .from("cloud_session_bindings")
    .select("session_id", { count: "exact", head: true });
  const activeSessBase = supabase
    .from("cloud_session_bindings")
    .select("session_id", { count: "exact", head: true })
    .is("ended_at", null);

  const [
    skillsRes,
    helpersRes,
    sitesRes,
    credsRes,
    toolkitsRes,
    totalSessionsRes,
    activeSessionsRes,
  ] = await Promise.all([
    (workspaceId ? skillsBase.eq("workspace_id", workspaceId) : skillsBase)
      .order("created_at", { ascending: false })
      .limit(100),
    (workspaceId ? helpersBase.eq("workspace_id", workspaceId) : helpersBase)
      .order("created_at", { ascending: false })
      .limit(100),
    (workspaceId ? sitesBase.eq("workspace_id", workspaceId) : sitesBase)
      .order("last_verified_at", { ascending: false })
      .limit(100),
    (workspaceId ? credsBase.eq("workspace_id", workspaceId) : credsBase)
      .order("created_at", { ascending: false })
      .limit(100),
    (workspaceId ? toolkitsBase.eq("workspace_id", workspaceId) : toolkitsBase)
      .order("fetched_at", { ascending: false })
      .limit(50),
    workspaceId ? totalSessBase.eq("workspace_id", workspaceId) : totalSessBase,
    workspaceId ? activeSessBase.eq("workspace_id", workspaceId) : activeSessBase,
  ]);

  const skills: AgentSkill[] = (skillsRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    kind: r.kind,
    host: r.host,
    scope: r.scope,
    confidence: r.confidence,
    active: Boolean(r.active),
    pendingReview: Boolean(r.pending_review),
    requiresIntegrations: asStringArray(r.requires_integrations),
    createdAt: r.created_at,
  }));

  const helpers: AgentHelper[] = (helpersRes.data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    version: r.helper_version,
    active: Boolean(r.active),
    createdAt: r.created_at,
  }));

  const browserSessions: BrowserSession[] = (sitesRes.data ?? []).map((r) => ({
    host: r.host,
    displayName: r.display_name,
    capturedVia: r.captured_via,
    lastVerifiedAt: r.last_verified_at,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));

  const connections: AgentConnection[] = (credsRes.data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind,
    provenance: r.provenance,
    status: r.status,
    lastUsedAt: r.last_used_at,
    lastError: r.last_provider_error,
  }));

  const toolkits: ComposioToolkit[] = (toolkitsRes.data ?? []).map((r) => ({
    toolkitSlug: r.toolkit_slug,
    schemaVersion: r.schema_version,
    toolCount: Array.isArray(r.tools_json) ? r.tools_json.length : 0,
    fetchedAt: r.fetched_at,
  }));

  const connectedCount = connections.filter(
    (c) => (c.status ?? "").toLowerCase() === "connected" || (c.status ?? "").toLowerCase() === "active",
  ).length;

  return {
    configured: true,
    workspaceId: workspaceId ?? null,
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
  };
}

/**
 * Workspaces the user can switch between, with lightweight per-workspace
 * counts so the switcher shows which workspace holds which context/skills.
 */
export async function getWorkspaces(): Promise<WorkspaceSummary[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const [wsRes, skillRows, runRows, memberRows] = await Promise.all([
    supabase.from("workspaces").select("id,name,slug,type,created_at").order("created_at"),
    supabase.from("cloud_skills").select("workspace_id"),
    supabase.from("cloud_runs").select("workspace_id"),
    supabase.from("workspace_members").select("workspace_id"),
  ]);

  const tally = (rows: { workspace_id: string | null }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      if (r.workspace_id) m.set(r.workspace_id, (m.get(r.workspace_id) ?? 0) + 1);
    }
    return m;
  };
  const skills = tally(skillRows.data);
  const runs = tally(runRows.data);
  const members = tally(memberRows.data);

  return (wsRes.data ?? [])
    .map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      type: w.type,
      skills: skills.get(w.id) ?? 0,
      runs: runs.get(w.id) ?? 0,
      members: members.get(w.id) ?? 0,
    }))
    .sort((a, b) => b.skills - a.skills || b.runs - a.runs)
    .slice(0, 30);
}
