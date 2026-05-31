import "server-only";

import { cloudGet } from "@/lib/api/cloud";
import type { Run, RunStep } from "@/types/runs";
import type { PlatformEvent } from "@/types/platform-events";

/**
 * Read model for runs (and run steps), activity, pending actions, run needs,
 * live-view, and the agents list.
 *
 * SECURE MIGRATION: every function now calls `cloud/api` (`/v1/run-views/*`,
 * `/v1/automations`) with the request's short-lived WORKSPACE JWT (exchanged
 * from the user's Supabase session — see `@/lib/api/cloud`). The backend scopes
 * every read to the caller's workspace, so this lib no longer needs the
 * service-role admin client or a hardcoded PRIMARY_WORKSPACE_ID. The
 * Browserbase API key for live-view resolution now stays server-side in
 * cloud/api and is never touched here.
 *
 * Each exported function keeps its exact signature + return shape (this lib is
 * imported widely); the `workspaceId` params are now ignored (the JWT carries
 * the workspace) but retained for source compatibility.
 */

export async function getCloudRuns(_workspaceId?: string, limit = 100): Promise<Run[]> {
  const { runs } = await cloudGet<{ runs: Run[] }>(`/v1/run-views?limit=${limit}`, { runs: [] });
  return runs;
}

export async function getCloudRunById(id: string): Promise<Run | null> {
  const { run } = await cloudGet<{ run: Run | null }>(`/v1/run-views/${encodeURIComponent(id)}`, {
    run: null,
  });
  return run;
}

export async function getCloudRunSteps(runId: string): Promise<RunStep[]> {
  const { steps } = await cloudGet<{ steps: RunStep[] }>(
    `/v1/run-views/${encodeURIComponent(runId)}/steps`,
    { steps: [] },
  );
  return steps;
}

/**
 * Real platform-log events backed by cloud_activity (the live action log the
 * cloud worker writes). Mapped to the UI's PlatformEvent envelope. Privacy
 * class is action_log (never raw capture).
 */
export async function getCloudActivityEvents(
  _workspaceId?: string,
  limit = 300,
): Promise<PlatformEvent[]> {
  const { events } = await cloudGet<{ events: PlatformEvent[] }>(
    `/v1/run-views/activity?limit=${limit}`,
    { events: [] },
  );
  return events;
}

/**
 * Toolkits a run is blocked on because their Composio connection is missing or
 * expired. Returns distinct lower-cased toolkit slugs that still need connecting.
 */
export async function getRunConnectionNeeds(runId: string): Promise<string[]> {
  const { connectionNeeds } = await cloudGet<{ connectionNeeds: string[] }>(
    `/v1/run-views/${encodeURIComponent(runId)}/needs`,
    { connectionNeeds: [] },
  );
  return connectionNeeds;
}

/**
 * Hosts this run is blocked on because it needs a browser login the workspace
 * doesn't have. Hosts that are now connected (saved + unexpired) are dropped.
 */
export async function getRunBrowserLoginNeeds(runId: string): Promise<string[]> {
  const { browserLoginNeeds } = await cloudGet<{ browserLoginNeeds: string[] }>(
    `/v1/run-views/${encodeURIComponent(runId)}/needs`,
    { browserLoginNeeds: [] },
  );
  return browserLoginNeeds;
}

/**
 * The live-view URL for a run's CURRENTLY ACTIVE browser tab. Resolution
 * (calling Browserbase with the server-side BROWSERBASE_API_KEY) now happens in
 * cloud/api; this just returns the resolved URL. `pageUrl` is retained in the
 * shape for source compatibility but is no longer surfaced (always null) — the
 * renderer only needs the live-view URL.
 */
export async function getActiveLiveView(
  runId: string,
): Promise<{ liveViewUrl: string | null; pageUrl: string | null }> {
  const { liveViewUrl } = await cloudGet<{ liveViewUrl: string | null }>(
    `/v1/run-views/${encodeURIComponent(runId)}/live-view`,
    { liveViewUrl: null },
  );
  return { liveViewUrl, pageUrl: null };
}

export interface PendingActionRow {
  runId: string;
  kind: "browser_login" | "connection";
  label: string; // host or toolkit slug
}

/**
 * Workspace-wide "waiting on you" list — recent runs blocked needing the user to
 * connect a browser login or a Composio toolkit. Browser-login hosts that are
 * already saved (connected) are dropped.
 */
export async function getWorkspacePendingActions(
  _workspaceId?: string,
): Promise<PendingActionRow[]> {
  const { actions } = await cloudGet<{ actions: PendingActionRow[] }>(
    `/v1/run-views/pending-actions`,
    { actions: [] },
  );
  return actions;
}

export interface AgentSummaryRow {
  id: string;
  name: string;
  goal: string | null;
  status: string | null;
  createdAt: string | null;
}

interface AutomationListRow {
  id: string;
  name: string | null;
  goal: string | null;
  status: string | null;
  created_at: string | null;
}

/**
 * Real "Your agents" list backed by the automations table (workspace-scoped).
 * Backed by the existing `/v1/automations` endpoint (full rows) mapped to the
 * thin AgentSummaryRow projection.
 */
export async function getAutomationsList(
  _workspaceId?: string,
  limit = 12,
): Promise<AgentSummaryRow[]> {
  const { automations } = await cloudGet<{ automations: AutomationListRow[] }>(
    `/v1/automations`,
    { automations: [] },
  );
  return automations.slice(0, limit).map((a) => ({
    id: a.id,
    name: a.name ?? "Untitled agent",
    goal: a.goal ?? null,
    status: a.status ?? null,
    createdAt: a.created_at ?? null,
  }));
}
