import "server-only";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  CloudApprovalMode,
  CloudApprovalPolicy,
  CloudAutomation,
  CloudAutomationRun,
  CloudAutomationRunStatus,
  CloudAutomationStatus,
  CloudAutomationSummary,
  CloudAutomationTrigger,
} from "@/types/cloud-automation";
import type { RunStatus } from "@/types/runs";

/**
 * Real automations read model — backed by the live `automations` table and
 * `cloud_runs` (linked by automation_id). The rich CloudAutomation UI shape is
 * filled from real columns (name, goal, status, triggers, schedule, run
 * history); fields the platform does not yet track (per-run token/credit usage,
 * replay frames, worker ARNs, trust grants, spend) are returned as honest
 * empties/zeros rather than fabricated numbers. Workspace-scoped.
 */

interface AutomationRow {
  id: string;
  workspace_id: string;
  name: string | null;
  description: string | null;
  goal: string | null;
  triggers: unknown;
  approval_policy: unknown;
  outputs: unknown;
  version: number | null;
  status: string | null;
  created_at: string;
  updated_at: string | null;
}

interface RunRow {
  id: string;
  automation_id: string | null;
  account_id: string | null;
  cloud_agent_id: string | null;
  status: string | null;
  triggered_by: string | null;
  run_mode: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  result_summary: string | null;
  error_message: string | null;
  browserbase_session_id: string | null;
  live_view_url: string | null;
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function mapTriggers(raw: unknown): CloudAutomationTrigger[] {
  const arr = asArray(raw);
  if (arr.length === 0) return [{ id: "manual", type: "manual", status: "manual_only" }];
  return arr.map((t, i) => {
    const type = String(t.type ?? "");
    if (type === "schedule") {
      return {
        id: `schedule-${i}`,
        type: "schedule",
        cron: String(t.cron ?? ""),
        timezone: String(t.timezone ?? "UTC"),
        nextRunAt: "",
        status: "registered",
        eventBridgeName: "",
      };
    }
    if (type === "composio_webhook") {
      return {
        id: `webhook-${i}`,
        type: "composio_webhook",
        toolkit: String(t.toolkit ?? ""),
        event: String(t.event ?? ""),
        filters: (t.filters as Record<string, unknown>) ?? undefined,
        status: "registered",
        triggerRef: String(t.event ?? ""),
      };
    }
    return { id: `manual-${i}`, type: "manual", status: "manual_only" };
  });
}

function mapApprovalPolicy(raw: unknown): CloudApprovalPolicy {
  const p = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) ?? {};
  const mode = (["manual_review", "risk_based", "trusted_autonomous"] as const).includes(p.mode as CloudApprovalMode)
    ? (p.mode as CloudApprovalMode)
    : "manual_review";
  return {
    mode,
    requireForTools: Array.isArray(p.requireForTools) ? (p.requireForTools as string[]) : [],
    trustGrantIds: [],
    firstRunReviewRequired: p.firstRunReviewRequired !== false,
  };
}

function requiredCredentialsFrom(triggers: CloudAutomationTrigger[]): string[] {
  const set = new Set<string>();
  for (const t of triggers) if (t.type === "composio_webhook" && t.toolkit) set.add(t.toolkit);
  return [...set];
}

const RUN_STATUS_MAP: Record<string, CloudAutomationRunStatus> = {
  success: "completed",
  completed: "completed",
  verified: "completed",
  failed: "failed",
  error: "failed",
  cancelled: "cancelled",
  stopped: "cancelled",
  running: "running",
  active: "running",
  paused: "paused_by_user",
  paused_by_user: "paused_by_user",
  awaiting_approval: "awaiting_approval",
  booting: "booting",
  pending: "pending",
  queued: "pending",
};

function mapRunStatus(s: string | null): CloudAutomationRunStatus {
  return RUN_STATUS_MAP[(s ?? "").toLowerCase()] ?? "pending";
}

const RUN_STATUS_TO_RUNSTATUS: Record<CloudAutomationRunStatus, RunStatus> = {
  completed: "completed",
  failed: "failed",
  cancelled: "stopped",
  running: "running",
  paused_by_user: "paused_by_user",
  awaiting_approval: "paused",
  booting: "booting",
  pending: "pending",
};

function mapTrigger(triggeredBy: string | null): CloudAutomationRun["trigger"] {
  const t = (triggeredBy ?? "").toLowerCase();
  if (t.includes("schedule") || t.includes("cron")) return "scheduled";
  if (t.includes("webhook") || t.includes("composio")) return "webhook";
  if (t.includes("replay")) return "replay";
  return "manual";
}

function emptyUsage() {
  return { apiCreditsCents: 0, modelTokens: 0, browserMinutes: 0, toolCalls: 0, workerSeconds: 0 };
}

function mapRun(r: RunRow, automationName: string): CloudAutomationRun {
  return {
    id: r.id,
    automationId: r.automation_id ?? "",
    automationName,
    workspaceId: PRIMARY_WORKSPACE_ID,
    actorAccountId: r.account_id ?? "",
    deviceId: "",
    status: mapRunStatus(r.status),
    trigger: mapTrigger(r.triggered_by),
    runMode: r.run_mode === "dry_run" ? "dry_run" : r.run_mode === "replay" ? "replay" : "live",
    startedAt: r.started_at ?? r.created_at,
    completedAt: r.completed_at ?? undefined,
    resultSummary: r.result_summary ?? undefined,
    errorSummary: r.error_message ?? undefined,
    cloudAgentId: r.cloud_agent_id ?? "",
    worker: {
      poolId: "",
      queue: "",
      fargateTaskArn: "",
      browserbaseSessionId: r.browserbase_session_id ?? undefined,
      liveViewUrl: r.live_view_url ?? undefined,
      eventsUrl: "",
      replayJsonlUrl: "",
    },
    usage: emptyUsage(),
    outputs: [],
    events: [],
    replayFrames: [],
  };
}

function mapAutomation(row: AutomationRow): CloudAutomation {
  const triggers = mapTriggers(row.triggers);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name ?? "Untitled automation",
    description: row.description ?? "",
    goal: row.goal ?? "",
    source: "seeded_cloud",
    status: (["draft", "active", "paused", "archived"] as const).includes(row.status as CloudAutomationStatus)
      ? (row.status as CloudAutomationStatus)
      : "draft",
    version: row.version ?? 1,
    triggers,
    outputs: [],
    requiredCredentials: requiredCredentialsFrom(triggers),
    checkModules: [],
    approvalPolicy: mapApprovalPolicy(row.approval_policy),
    trustGrants: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    costLimitCents: 0,
  };
}

const AUTOMATION_COLS =
  "id,workspace_id,name,description,goal,triggers,approval_policy,outputs,version,status,created_at,updated_at";
const RUN_COLS =
  "id,automation_id,account_id,cloud_agent_id,status,triggered_by,run_mode,started_at,completed_at,created_at,result_summary,error_message,browserbase_session_id,live_view_url";

export async function getCloudAutomations(workspaceId?: string): Promise<CloudAutomationSummary[]> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return [];

  const { data: rows } = await supabase
    .from("automations")
    .select(AUTOMATION_COLS)
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false })
    .limit(100);
  const automations = (rows ?? []) as AutomationRow[];
  if (automations.length === 0) return [];

  // One pass over recent runs to compute per-automation stats.
  const { data: runRows } = await supabase
    .from("cloud_runs")
    .select("id,automation_id,status,started_at,created_at")
    .eq("workspace_id", ws)
    .not("automation_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const byAutomation = new Map<string, { runsLast7d: number; total: number; completed: number; last?: { id: string; status: string; startedAt: string } }>();
  for (const r of (runRows ?? []) as Array<{ id: string; automation_id: string; status: string | null; started_at: string | null; created_at: string }>) {
    const key = r.automation_id;
    const agg = byAutomation.get(key) ?? { runsLast7d: 0, total: 0, completed: 0 };
    const startedAt = r.started_at ?? r.created_at;
    agg.total += 1;
    if (new Date(startedAt).getTime() >= sevenDaysAgo) agg.runsLast7d += 1;
    const st = mapRunStatus(r.status);
    if (st === "completed") agg.completed += 1;
    if (!agg.last) agg.last = { id: r.id, status: r.status ?? "", startedAt };
    byAutomation.set(key, agg);
  }

  return automations.map((row) => {
    const base = mapAutomation(row);
    const agg = byAutomation.get(row.id);
    const lastRunStatus = agg?.last ? RUN_STATUS_TO_RUNSTATUS[mapRunStatus(agg.last.status)] : undefined;
    return {
      ...base,
      runsLast7d: agg?.runsLast7d ?? 0,
      successRate: agg && agg.total > 0 ? agg.completed / agg.total : null,
      lastRun: agg?.last ? { id: agg.last.id, status: lastRunStatus ?? "completed", startedAt: agg.last.startedAt } : undefined,
      lastRunId: agg?.last?.id,
      nextRunAt: undefined,
      activeTrustGrantCount: 0,
      monthlySpendCents: 0,
    } satisfies CloudAutomationSummary;
  });
}

export async function getCloudAutomationDetail(
  id: string,
  workspaceId?: string,
): Promise<{ automation: CloudAutomation; runs: CloudAutomationRun[] } | null> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return null;

  const { data: row } = await supabase
    .from("automations")
    .select(AUTOMATION_COLS)
    .eq("id", id)
    .eq("workspace_id", ws)
    .maybeSingle();
  if (!row) return null;
  const automation = mapAutomation(row as AutomationRow);

  const { data: runRows } = await supabase
    .from("cloud_runs")
    .select(RUN_COLS)
    .eq("workspace_id", ws)
    .eq("automation_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  const runs = ((runRows ?? []) as RunRow[]).map((r) => mapRun(r, automation.name));
  return { automation: { ...automation, lastRunId: runs[0]?.id }, runs };
}
