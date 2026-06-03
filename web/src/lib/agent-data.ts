import "server-only";

import { cloudGet } from "@/lib/api/cloud";

/**
 * Live read model for the Basichome "Agent" surface.
 *
 * Reads the real data the opencode self-healing cloud worker writes to the
 * Basics Supabase project: skills it has learned, agent-authored helper
 * modules, managed-browser cookie sessions, and Composio / direct-auth
 * credentials. Privacy boundary: cookie blobs (storage_state_json) and
 * credential secrets (ciphertext) are NEVER selected, so they can never reach
 * the renderer.
 *
 * Now backed by cloud/api (`GET /v1/agent`) authed with the request's
 * short-lived workspace JWT - every read is scoped to the caller's workspace by
 * the backend, replacing the old service-role admin client + hardcoded
 * PRIMARY_WORKSPACE_ID. No service-role key ever reaches the renderer.
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

/**
 * Live agent overview for the caller's workspace.
 *
 * Backed by cloud/api `GET /v1/agent`, which ports every sub-query server-side
 * (cloud_skills, cloud_agent_helpers, workspace_browser_sites,
 * workspace_credentials, composio_tool_cache, cloud_session_bindings counts) and
 * derives the metrics. The `workspaceId` argument is retained for signature
 * compatibility but is no longer used to choose a workspace: the backend scopes
 * every read to the workspace embedded in the request's JWT, so a token can only
 * ever read its own workspace. Returns the empty model on any failure.
 */
export async function getAgentData(_workspaceId?: string): Promise<AgentData> {
  return cloudGet<AgentData>("/v1/agent", EMPTY);
}

/**
 * Workspaces the user can switch between.
 *
 * Per-user-scope limitation: a workspace JWT can only ever see ITS OWN
 * workspace, so the old cross-workspace listing (a service-role admin scan of
 * every `workspaces` row with global per-workspace tallies) is structurally
 * impossible here - there is no longer any admin client. We derive a
 * single-element list describing just the current workspace from the agent
 * overview (`/v1/agent`), so the workspace switcher still renders the workspace
 * the caller is in. The per-workspace `runs`/`members` tallies are not available
 * from a single-workspace read; `skills` comes from the agent metrics, the rest
 * are 0 (the switcher only needs identity + skill count to render).
 */
export async function getWorkspaces(): Promise<WorkspaceSummary[]> {
  const data = await getAgentData();
  if (!data.configured || !data.workspaceId) return [];
  return [
    {
      id: data.workspaceId,
      name: "Workspace",
      slug: null,
      type: null,
      skills: data.metrics.skills,
      runs: 0,
      members: 0,
    },
  ];
}
