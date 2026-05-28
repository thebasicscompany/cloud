import type { BrowserRunState, BrowserRuntimeTarget } from "@/types/browser-runtime";

export type RuntimeTarget = "auto" | "local_device" | "local_browser" | "local_app" | "codex_app_server" | "codex_exec" | "basics_cloud";

export type RuntimeSelection = "basics_local_runner" | "basics_local_browser" | "basics_local_app" | "codex_app_server" | "codex_exec" | "basics_cloud_worker";

export type LocalAgentRunStatus =
  | "accepted"
  | "thinking"
  | "running"
  | "waiting_for_approval"
  | "paused"
  | "failed"
  | "complete"
  | "stopped";

export type LocalAgentOverlayStatus =
  | "idle"
  | "thinking"
  | "running"
  | "waiting_for_approval"
  | "paused"
  | "failed"
  | "complete";

export type LocalAgentTaskKind =
  | "chat"
  | "screen_help"
  | "run_automation"
  | "build_app"
  | "edit_app"
  | "deploy_app"
  | "browser_task"
  | "data_task";

export type BasicsRunIntent = {
  source: "pill" | "dashboard" | "cli" | "app" | "automation" | "suggestion";
  taskKind: LocalAgentTaskKind;
  prompt: string;
  requestedTarget: RuntimeTarget;
  browserRuntimeTarget?: BrowserRuntimeTarget | "auto";
  workspaceId: string;
  localDeviceId: string;
};

export type RuntimeResolution = {
  runId: string;
  selectedTarget: Exclude<RuntimeTarget, "auto">;
  provider: "basics" | "codex" | "managed";
  model: string;
  runtime: RuntimeSelection;
  browserRuntimeTarget?: BrowserRuntimeTarget;
  authMode: "local_included" | "local_browser_profile" | "active_browser_user_account" | "local_codex_account" | "workspace_managed_credits" | "unknown_unavailable";
  costBearer: "included_local" | "user_codex_subscription" | "workspace_credits" | "unknown_unavailable";
  contextSource: "lens_distilled" | "current_screen" | "app_data" | "none";
  approvalPolicy: "none" | "first_run_review" | "codex_policy_gate_required" | "cloud_promotion_required" | "fail_closed";
  fallbackTargets: Array<Exclude<RuntimeTarget, "auto">>;
  reason: string;
};

export type LocalAgentToolCall = {
  id: string;
  name: string;
  target: Exclude<RuntimeTarget, "auto">;
  status: "queued" | "running" | "completed" | "failed" | "paused";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
};

export type LocalAgentEventType =
  | "run.accepted"
  | "runtime.route.resolved"
  | "engine.status.checked"
  | "engine.unavailable"
  | "policy.gate.evaluated"
  | "run.fallback.selected"
  | "browser.profile.selected"
  | "browser.login.required"
  | "browser.session.started"
  | "browser.page.loaded"
  | "browser.action.performed"
  | "browser.screenshot.saved"
  | "browser.live_view.opened"
  | "browser.takeover.enabled"
  | "browser.cloud.promotion_queued"
  | "agent.thinking"
  | "codex.thread.started"
  | "codex.turn.started"
  | "codex.exec.event"
  | "codex.exec.completed"
  | "codex.exec.failed"
  | "tool_call.started"
  | "tool_call.completed"
  | "run.paused"
  | "run.resumed"
  | "run.stopped"
  | "run.promoted_to_cloud"
  | "approval.required"
  | "run.completed"
  | "run.failed";

export type LocalAgentLogEvent = {
  id: string;
  type: LocalAgentEventType;
  message: string;
  runId: string;
  actorAccountId: string;
  deviceId: string;
  toolCallId?: string;
  target: Exclude<RuntimeTarget, "auto">;
  runtime: RuntimeSelection;
  source: "client" | "agent" | "browser" | "codex" | "cloud" | "app";
  privacyClass: "action_log" | "distilled_cloud";
  createdAt: string;
  payload?: Record<string, unknown>;
};

export type LocalAgentRun = {
  runId: string;
  workspaceId: string;
  actorAccountId: string;
  deviceId: string;
  taskTitle: string;
  prompt: string;
  status: LocalAgentRunStatus;
  overlayStatus: LocalAgentOverlayStatus;
  intent: BasicsRunIntent;
  resolution: RuntimeResolution;
  browser?: BrowserRunState;
  toolCalls: LocalAgentToolCall[];
  events: LocalAgentLogEvent[];
  activeToolCallId?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type LocalAgentStore = {
  schemaVersion: 1;
  activeRunId?: string;
  runs: LocalAgentRun[];
};
