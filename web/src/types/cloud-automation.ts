import type { RunStatus } from "@/types/runs";

export type CloudAutomationStatus = "draft" | "active" | "paused" | "archived";

export type CloudTriggerStatus = "registered" | "paused" | "manual_only" | "needs_credentials";

export type CloudAutomationTrigger =
  | {
      id: string;
      type: "manual";
      status: CloudTriggerStatus;
    }
  | {
      id: string;
      type: "schedule";
      cron: string;
      timezone: string;
      nextRunAt: string;
      status: CloudTriggerStatus;
      eventBridgeName: string;
    }
  | {
      id: string;
      type: "composio_webhook";
      toolkit: string;
      event: string;
      filters?: Record<string, unknown>;
      status: CloudTriggerStatus;
      triggerRef: string;
    };

export type CloudApprovalMode = "manual_review" | "risk_based" | "trusted_autonomous";

export type CloudApprovalPolicy = {
  mode: CloudApprovalMode;
  requireForTools: string[];
  trustGrantIds: string[];
  firstRunReviewRequired: boolean;
};

export type CloudTrustGrantStatus = "active" | "revoked" | "pending_review";

export type CloudTrustGrant = {
  id: string;
  automationId: string;
  label: string;
  toolSlug: string;
  scopeDescription: string;
  constraints: Record<string, unknown>;
  status: CloudTrustGrantStatus;
  createdAt: string;
  updatedAt: string;
  decidedVia: "desktop" | "sms" | "seeded";
  lastUsedAt?: string;
};

export type CloudAutomationOutput = {
  id: string;
  runId: string;
  automationId: string;
  kind: "gmail_draft" | "email_sent" | "sms" | "sheet_write" | "artifact" | "log";
  summary: string;
  target: string;
  createdAt: string;
};

export type CloudAutomationUsage = {
  apiCreditsCents: number;
  modelTokens: number;
  browserMinutes: number;
  toolCalls: number;
  workerSeconds: number;
};

export type CloudReplayFrame = {
  id: string;
  runId: string;
  at: string;
  event: string;
  jsonl: string;
};

export type CloudRunEventType =
  | "automation.promoted_from_local"
  | "automation.paused"
  | "automation.resumed"
  | "automation.schedule_updated"
  | "automation.trigger_registered"
  | "trust_grant.applied"
  | "trust_grant.revoked"
  | "run_queued"
  | "run_started"
  | "browser_session_started"
  | "tool_call_start"
  | "tool_call_end"
  | "approval_requested"
  | "approval_auto_approved"
  | "screenshot"
  | "output_created"
  | "verification_passed"
  | "run_completed"
  | "run_failed"
  | "run_cancelled"
  | "replay_frame_written"
  | "replay_started";

export type CloudRunEvent = {
  id: string;
  type: CloudRunEventType;
  message: string;
  runId: string;
  automationId: string;
  workspaceId: string;
  actorAccountId: string;
  deviceId: string;
  toolCallId?: string;
  source: "client" | "scheduler" | "worker" | "browser" | "cloud" | "approval";
  privacyClass: "action_log" | "distilled_cloud";
  createdAt: string;
  payload?: Record<string, unknown>;
};

export type CloudAutomationRunStatus =
  | "pending"
  | "booting"
  | "running"
  | "paused_by_user"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type CloudAutomationRun = {
  id: string;
  automationId: string;
  automationName: string;
  workspaceId: string;
  actorAccountId: string;
  deviceId: string;
  status: CloudAutomationRunStatus;
  trigger: "manual" | "scheduled" | "webhook" | "replay";
  runMode: "live" | "dry_run" | "replay";
  startedAt: string;
  completedAt?: string;
  resultSummary?: string;
  errorSummary?: string;
  localSourceRunId?: string;
  cloudAgentId: string;
  worker: {
    poolId: string;
    queue: string;
    fargateTaskArn: string;
    browserbaseSessionId?: string;
    liveViewUrl?: string;
    eventsUrl: string;
    replayJsonlUrl: string;
  };
  usage: CloudAutomationUsage;
  outputs: CloudAutomationOutput[];
  events: CloudRunEvent[];
  replayFrames: CloudReplayFrame[];
};

export type CloudAutomation = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  goal: string;
  source: "seeded_cloud" | "local_promotion" | "api_import";
  /** Where it runs: "cloud" (Browserbase/Composio, fires anytime) or "local"
   *  (drives the user's real machine; only fires when their desktop is online). */
  runTarget: "cloud" | "local";
  status: CloudAutomationStatus;
  version: number;
  triggers: CloudAutomationTrigger[];
  outputs: Array<{ channel: "desktop" | "sms" | "email" | "artifact"; target: string; when: "on_complete" | "on_failure" }>;
  requiredCredentials: string[];
  checkModules: string[];
  approvalPolicy: CloudApprovalPolicy;
  trustGrants: CloudTrustGrant[];
  createdAt: string;
  updatedAt: string;
  lastRunId?: string;
  localSourceRunId?: string;
  costLimitCents: number;
};

export type CloudAutomationSummary = CloudAutomation & {
  runsLast7d: number;
  successRate: number | null;
  lastRun?: {
    id: string;
    status: RunStatus;
    startedAt: string;
  };
  nextRunAt?: string;
  activeTrustGrantCount: number;
  monthlySpendCents: number;
};

export type CloudAutomationStore = {
  schemaVersion: 1;
  automations: CloudAutomation[];
  runs: CloudAutomationRun[];
  logs: CloudRunEvent[];
  activeRunId?: string;
  lastPromotedAutomationId?: string;
};
