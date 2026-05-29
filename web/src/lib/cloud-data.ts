import "server-only";

import { getConnections, PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Run, RunStatus, RunStep, RunStepKind, RunStepPayload, RunTrigger } from "@/types/runs";
import type {
  PlatformEvent,
  PlatformEventSource,
  PlatformEventStatus,
} from "@/types/platform-events";

/**
 * Real read model for runs (and run steps) backed by the live Basics Supabase
 * project. Replaces the localStorage mock for the Runs surface. Read-only via
 * the service-role client; binary/large columns (execution_state, prompt
 * snapshots) are never selected.
 */

const RUN_STATUS: Record<string, RunStatus> = {
  pending: "pending",
  queued: "pending",
  booting: "booting",
  running: "running",
  paused_for_approval: "paused",
  awaiting_user: "paused_by_user",
  completed: "completed",
  failed: "failed",
  cancelled: "stopped",
  stopped: "stopped",
};

const RUN_TRIGGER: Record<string, RunTrigger> = {
  manual: "manual",
  schedule: "scheduled",
  composio_webhook: "api",
  dry_run: "manual",
};

const STEP_KIND: Record<string, RunStepKind> = {
  plan: "model_thinking",
  resume: "model_thinking",
  tool_execution: "tool_call",
  approval_wait: "approval",
};

const RUN_SELECT =
  "id,automation_id,cloud_agent_id,workspace_id,account_id,status,started_at,completed_at,created_at,last_progress_at,duration_seconds,result_summary,error_message,failure_reason,run_mode,browserbase_session_id,live_view_url,recording_url,triggered_by,automations(name),cloud_agents(agent_id)";

// Statuses the UI renders as "live". A run that claims one of these but hasn't
// progressed in STALE_MS is treated as orphaned for display, so a dead worker
// can never surface as a multi-day "running" card.
const LIVE_STATUSES = new Set<RunStatus>([
  "pending",
  "booting",
  "running",
  "paused",
  "paused_by_user",
  "verifying",
]);
const STALE_MS = 30 * 60 * 1000;

function mapRun(r: Record<string, unknown>): Run {
  const automation = (Array.isArray(r.automations) ? r.automations[0] : r.automations) as
    | { name?: string }
    | null;
  const agent = (Array.isArray(r.cloud_agents) ? r.cloud_agents[0] : r.cloud_agents) as
    | { agent_id?: string }
    | null;
  const name = automation?.name ?? agent?.agent_id ?? "Cloud run";
  let status: RunStatus = RUN_STATUS[(r.status as string) ?? ""] ?? "pending";
  // Self-healing: a "live" run with no progress for >30m is orphaned.
  const lastProgress =
    (r.last_progress_at as string) ?? (r.started_at as string) ?? (r.created_at as string);
  const orphaned =
    LIVE_STATUSES.has(status) &&
    Boolean(lastProgress) &&
    Date.now() - new Date(lastProgress).getTime() > STALE_MS;
  if (orphaned) status = "failed";
  return {
    id: r.id as string,
    workflowId: (r.automation_id as string) ?? (r.cloud_agent_id as string) ?? "",
    workflowName: name,
    workspaceId: r.workspace_id as string,
    status,
    trigger: RUN_TRIGGER[(r.triggered_by as string) ?? ""] ?? "manual",
    takeoverActive: false,
    startedAt: (r.started_at as string) ?? (r.created_at as string) ?? new Date().toISOString(),
    completedAt: (r.completed_at as string) ?? undefined,
    stepCount: 0,
    errorSummary:
      (r.error_message as string) ??
      (r.failure_reason as string) ??
      (orphaned ? "Orphaned — no worker progress for 30m+" : undefined),
    runtime: (r.run_mode as string) ?? "cloud",
    executionTarget: "basics_cloud",
    actorAccountId: (r.account_id as string) ?? undefined,
    browserbaseSessionId: (r.browserbase_session_id as string) ?? undefined,
    liveUrl: (r.live_view_url as string) ?? undefined,
    recordingUrl: (r.recording_url as string) ?? undefined,
    resultSummary: (r.result_summary as string) ?? undefined,
  };
}

export async function getCloudRuns(workspaceId?: string, limit = 100): Promise<Run[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const base = supabase.from("cloud_runs").select(RUN_SELECT);
  const { data } = await (workspaceId ? base.eq("workspace_id", workspaceId) : base)
    .order("created_at", { ascending: false })
    .limit(limit);
  const runs = (data ?? []).map(mapRun);

  // Backfill step counts in one grouped pass (avoids N+1).
  const ids = runs.map((r) => r.id);
  if (ids.length) {
    const { data: steps } = await supabase
      .from("cloud_run_steps")
      .select("agent_run_id")
      .in("agent_run_id", ids);
    const counts = new Map<string, number>();
    for (const s of steps ?? []) {
      const k = s.agent_run_id as string;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const r of runs) r.stepCount = counts.get(r.id) ?? 0;
  }
  return runs;
}

export async function getCloudRunById(id: string): Promise<Run | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data } = await supabase.from("cloud_runs").select(RUN_SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  const run = mapRun(data);
  const { count } = await supabase
    .from("cloud_run_steps")
    .select("id", { count: "exact", head: true })
    .eq("agent_run_id", id);
  run.stepCount = count ?? 0;
  return run;
}

export async function getCloudRunSteps(runId: string): Promise<RunStep[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("cloud_run_steps")
    .select("id,agent_run_id,step_number,kind,payload,status,created_at,check_passed,check_evidence,gating_reason")
    .eq("agent_run_id", runId)
    .order("step_number", { ascending: true })
    .limit(500);

  // Harness runs record their trace in cloud_activity rather than
  // cloud_run_steps; fall back to the real activity stream so the run
  // detail shows the actual execution timeline.
  if ((data ?? []).length === 0) {
    const { data: acts } = await supabase
      .from("cloud_activity")
      .select("id,agent_run_id,activity_type,payload,created_at")
      .eq("agent_run_id", runId)
      .order("created_at", { ascending: true })
      .limit(500);
    return (acts ?? []).map((a, i) => {
      const type = (a.activity_type as string) ?? "event";
      const raw = (a.payload ?? {}) as Record<string, unknown>;
      let kind: RunStepKind = "model_thinking";
      let payload: RunStepPayload;
      if (type.startsWith("tool_call") || type === "oc.tool_use") {
        kind = "tool_call";
        payload = {
          kind: "tool_call",
          toolName: (raw.tool_name as string) ?? (raw.name as string) ?? type,
          params: (raw.args as Record<string, unknown>) ?? {},
          result: (raw.result as Record<string, unknown>) ?? undefined,
          durationMs: 0,
        };
      } else if (type === "pending_approval") {
        kind = "approval";
        payload = { kind: "approval", approvalId: (raw.approval_id as string) ?? "", action: type, status: "pending" };
      } else {
        payload = {
          kind: "model_thinking",
          text:
            (raw.text as string) ??
            (raw.message as string) ??
            (raw.summary as string) ??
            type,
        };
      }
      return {
        id: a.id as string,
        runId,
        stepIndex: i,
        kind,
        payload,
        createdAt: (a.created_at as string) ?? new Date().toISOString(),
      } satisfies RunStep;
    });
  }

  return (data ?? []).map((s) => {
    const kind = STEP_KIND[(s.kind as string) ?? ""] ?? "model_thinking";
    const raw = (s.payload ?? {}) as Record<string, unknown>;
    let payload: RunStepPayload;
    if (kind === "tool_call") {
      payload = {
        kind: "tool_call",
        toolName: (raw.tool_name as string) ?? (raw.toolName as string) ?? (s.kind as string) ?? "tool",
        params: (raw.args as Record<string, unknown>) ?? (raw.params as Record<string, unknown>) ?? {},
        result: (raw.result as Record<string, unknown>) ?? undefined,
        error: (raw.error as string) ?? undefined,
        durationMs: Number(raw.duration_ms ?? 0),
      };
    } else if (kind === "approval") {
      payload = {
        kind: "approval",
        approvalId: (raw.approval_id as string) ?? "",
        action: (raw.tool_name as string) ?? (s.gating_reason as string) ?? "approval",
        status: s.status === "completed" ? "approved" : "pending",
      };
    } else if (s.check_passed != null) {
      payload = {
        kind: "check",
        checkName: (raw.check_name as string) ?? "check",
        passed: Boolean(s.check_passed),
        evidence: { detail: (s.check_evidence as string) ?? "" },
      };
    } else {
      payload = {
        kind: "model_thinking",
        text:
          (raw.text as string) ??
          (raw.message as string) ??
          (raw.summary as string) ??
          (s.gating_reason as string) ??
          `${s.kind ?? "step"}`,
      };
    }
    return {
      id: s.id as string,
      runId: s.agent_run_id as string,
      stepIndex: (s.step_number as number) ?? 0,
      kind,
      payload,
      createdAt: (s.created_at as string) ?? new Date().toISOString(),
    };
  });
}

const ACTIVITY_STATUS: Record<string, PlatformEventStatus> = {
  run_started: "running",
  run_completed: "completed",
  run_cancelled: "revoked",
  run_system_error: "failed",
  tool_call_failed: "failed",
  pending_approval: "blocked",
  final_answer: "completed",
};

function activitySource(type: string): PlatformEventSource {
  if (type === "pending_approval") return "approval";
  if (type.startsWith("browser_") || type.startsWith("browserbase")) return "agent";
  return "cloud";
}

/**
 * Real platform-log events backed by cloud_activity (the live action log the
 * cloud worker writes). Mapped to the UI's PlatformEvent envelope. Privacy
 * class is action_log (never raw capture).
 */
export async function getCloudActivityEvents(workspaceId?: string, limit = 300): Promise<PlatformEvent[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const base = supabase
    .from("cloud_activity")
    .select("id,agent_run_id,workspace_id,account_id,activity_type,payload,created_at");
  const { data } = await (workspaceId ? base.eq("workspace_id", workspaceId) : base)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((a) => {
    const type = (a.activity_type as string) ?? "event";
    const payload = (a.payload ?? {}) as Record<string, unknown>;
    return {
      id: a.id as string,
      workspace_id: (a.workspace_id as string) ?? "",
      actor_account_id: (a.account_id as string) ?? "",
      run_id: (a.agent_run_id as string) ?? undefined,
      source: activitySource(type),
      actor_type: "agent",
      event_type: type,
      privacy_class: "action_log",
      redaction_state: "summarized",
      target: "cloud",
      execution_target: "cloud",
      status: ACTIVITY_STATUS[type] ?? "info",
      created_at: (a.created_at as string) ?? new Date().toISOString(),
      payload_inline: payload,
      labels: [],
    } satisfies PlatformEvent;
  });
}

/**
 * Toolkits a run is blocked on because their Composio connection is missing or
 * expired. The cloud worker writes a `connection_expired` activity row when a
 * tool call fails with `no_connection` / `no_active_account`; the toolkit slug
 * lives in `payload->>'toolkitSlug'` (camelCase — confirmed against real rows,
 * e.g. {"kind":"connection_expired","reason":"no_active_account",
 * "toolSlug":"GMAIL_LIST_MESSAGES","toolkitSlug":"gmail"}). A handful of legacy
 * rows carry only a `connected_account_id` and no slug; those are skipped.
 *
 * `composio_resolved` rows describe which toolkits the run resolved at boot;
 * they only count as a "need" when the worker flagged them missing (a truthy
 * `missing` flag, or a slug listed under `missingToolkitSlugs`).
 *
 * Returns distinct lower-cased toolkit slugs that still need connecting.
 */
export async function getRunConnectionNeeds(runId: string): Promise<string[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("cloud_activity")
    .select("activity_type,payload")
    .eq("agent_run_id", runId)
    .in("activity_type", ["connection_expired", "composio_resolved"])
    .limit(500);

  const slugs = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") {
      const slug = value.trim().toLowerCase();
      if (slug) slugs.add(slug);
    }
  };

  for (const row of data ?? []) {
    const type = (row.activity_type as string) ?? "";
    const payload = (row.payload ?? {}) as Record<string, unknown>;

    if (type === "connection_expired") {
      // Primary signal: camelCase `toolkitSlug`. Tolerate the snake_case /
      // bare `toolkit` shapes the prompt mentioned in case the worker changes.
      add(payload.toolkitSlug ?? payload.toolkit_slug ?? payload.toolkit);
      continue;
    }

    // composio_resolved — only a "need" when explicitly flagged missing.
    if (payload.missing) add(payload.toolkitSlug ?? payload.toolkit_slug ?? payload.toolkit);
    const missingList = payload.missingToolkitSlugs;
    if (Array.isArray(missingList)) for (const s of missingList) add(s);
  }

  return [...slugs];
}

/**
 * Hosts this run is blocked on because it needs a browser login the workspace
 * doesn't have (derived from `browser_login_required` activity rows). Hosts that
 * are now connected (saved + unexpired in workspace_browser_sites) are dropped
 * so the banner clears once the user signs in. Used by the run banner to offer
 * a one-click "Sign in to <host>".
 */
export async function getRunBrowserLoginNeeds(runId: string): Promise<string[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("cloud_activity")
    .select("payload,workspace_id")
    .eq("agent_run_id", runId)
    .eq("activity_type", "browser_login_required")
    .limit(200);

  const hosts = new Set<string>();
  let workspaceId: string | undefined;
  for (const row of data ?? []) {
    workspaceId = (row.workspace_id as string) ?? workspaceId;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const host = typeof payload.host === "string" ? payload.host.trim().toLowerCase().replace(/^www\./, "") : "";
    if (host) hosts.add(host);
  }
  if (hosts.size === 0) return [];

  // Drop hosts already connected so the banner disappears once fixed.
  if (workspaceId) {
    const { data: saved } = await supabase
      .from("workspace_browser_sites")
      .select("host")
      .eq("workspace_id", workspaceId)
      .gt("expires_at", new Date().toISOString());
    for (const s of saved ?? []) hosts.delete(((s.host as string) ?? "").toLowerCase().replace(/^www\./, ""));
  }
  return [...hosts];
}

/**
 * The live-view URL for a run's CURRENTLY ACTIVE browser tab. The run's stored
 * `live_view_url` is pinned to the session's first target (often about:blank)
 * while the agent works in a new tab — so we resolve the active tab live via
 * the Browserbase debug API and prefer the last non-blank page. Returns null
 * (caller falls back to the stored URL) if the key/session/page isn't available.
 */
export async function getActiveLiveViewUrl(runId: string): Promise<string | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data: run } = await supabase
    .from("cloud_runs")
    .select("browserbase_session_id")
    .eq("id", runId)
    .maybeSingle();
  const sid = (run?.browserbase_session_id as string | undefined) ?? undefined;
  const key = process.env.BROWSERBASE_API_KEY;
  if (!sid || !key) return null;
  try {
    const res = await fetch(`https://api.browserbase.com/v1/sessions/${sid}/debug`, {
      headers: { "X-BB-API-Key": key },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      debuggerFullscreenUrl?: string;
      pages?: Array<{ url?: string; debuggerFullscreenUrl?: string; debuggerUrl?: string }>;
    };
    const pages = json.pages ?? [];
    // Prefer the last non-about:blank page — that's the tab the agent is on.
    const real = [...pages].reverse().find((p) => p.url && !p.url.startsWith("about:"));
    const pick = real ?? pages[pages.length - 1];
    return pick?.debuggerFullscreenUrl ?? pick?.debuggerUrl ?? json.debuggerFullscreenUrl ?? null;
  } catch {
    return null;
  }
}

export interface PendingActionRow {
  runId: string;
  kind: "browser_login" | "connection";
  label: string; // host or toolkit slug
}

/**
 * Workspace-wide "waiting on you" list — recent runs blocked needing the user to
 * connect a browser login or a Composio toolkit. Powers the home banner so these
 * action-requests aren't buried inside individual runs. Browser-login hosts that
 * are already saved (connected) are dropped.
 */
export async function getWorkspacePendingActions(workspaceId?: string): Promise<PendingActionRow[]> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("cloud_activity")
    .select("agent_run_id,activity_type,payload,created_at")
    .eq("workspace_id", ws)
    .in("activity_type", ["browser_login_required", "connection_expired"])
    .gt("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: saved } = await supabase
    .from("workspace_browser_sites")
    .select("host")
    .eq("workspace_id", ws)
    .gt("expires_at", new Date().toISOString());
  const savedHosts = new Set((saved ?? []).map((s) => ((s.host as string) ?? "").toLowerCase().replace(/^www\./, "")));

  // Drop Composio needs for toolkits that are ALREADY connected now (the
  // connection_expired row may be stale from before the user connected it).
  const conn = await getConnections(ws).catch(() => null);
  const connectedToolkits = new Set(
    (conn?.toolkits ?? []).map((t) => t.slug.toLowerCase()).concat((conn?.credentials ?? []).map((c) => c.kind.toLowerCase())),
  );

  const seen = new Set<string>();
  const out: PendingActionRow[] = [];
  for (const row of data ?? []) {
    const runId = (row.agent_run_id as string) ?? "";
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    if (!runId) continue;
    if (row.activity_type === "browser_login_required") {
      const host = typeof payload.host === "string" ? payload.host.toLowerCase().replace(/^www\./, "") : "";
      if (!host || savedHosts.has(host)) continue;
      const k = `b:${runId}:${host}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ runId, kind: "browser_login", label: host });
    } else {
      const slug = String(payload.toolkitSlug ?? payload.toolkit_slug ?? payload.toolkit ?? "").toLowerCase();
      if (!slug || connectedToolkits.has(slug)) continue; // skip already-connected toolkits
      const k = `c:${runId}:${slug}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ runId, kind: "connection", label: slug });
    }
  }
  return out.slice(0, 8);
}

export interface AgentSummaryRow {
  id: string;
  name: string;
  goal: string | null;
  status: string | null;
  createdAt: string | null;
}

/**
 * Real "Your agents" list backed by the automations table (workspace-scoped).
 */
export async function getAutomationsList(workspaceId?: string, limit = 12): Promise<AgentSummaryRow[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const base = supabase.from("automations").select("id,name,goal,status,created_at");
  const { data } = await (workspaceId ? base.eq("workspace_id", workspaceId) : base)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((a) => ({
    id: a.id as string,
    name: (a.name as string) ?? "Untitled agent",
    goal: (a.goal as string) ?? null,
    status: (a.status as string) ?? null,
    createdAt: (a.created_at as string) ?? null,
  }));
}
