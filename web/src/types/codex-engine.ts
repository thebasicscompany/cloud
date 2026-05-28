import type { LocalAgentTaskKind, LocalAgentToolCall, RuntimeTarget } from "@/types/local-agent";

export type CodexRuntimeMode = "codex_app_server" | "codex_exec";

export type EngineAuthMode =
  | "basics_managed"
  | "byok_api_key"
  | "codex_local_account"
  | "local_model"
  | "workspace_cloud_auth"
  | "enterprise_contract";

export type CostBearer =
  | "included_local"
  | "user_codex_subscription"
  | "user_api_key"
  | "workspace_managed_credits"
  | "enterprise_contract"
  | "unknown_unavailable";

export type CodexEngineState =
  | "ready"
  | "not_installed"
  | "not_authenticated"
  | "blocked_by_policy"
  | "unsupported_target";

export type CodexEngineStatus = {
  engineId: "codex";
  displayName: "Codex";
  available: boolean;
  installed: boolean;
  authenticated: boolean;
  state: CodexEngineState;
  cliPath?: string;
  cliVersion?: string;
  appServerAvailable: boolean;
  execJsonAvailable: boolean;
  acpAdapterAvailable: boolean;
  authMode: EngineAuthMode;
  costBearer: CostBearer;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  lastCheckedAt: string;
  installHint?: string;
  reconnectHint?: string;
};

export type CodexEngineStore = {
  schemaVersion: 1;
  status: CodexEngineStatus;
};

export type CodexPolicyDecision = {
  allowed: boolean;
  mode: CodexRuntimeMode;
  taskKind: LocalAgentTaskKind;
  requestedTarget: RuntimeTarget;
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy: "none" | "first_run_review" | "per_tool_approval" | "blocked";
  filesystem: "none" | "read_only" | "workspace_write";
  network: "blocked" | "allowed_with_approval";
  commandExecution: "blocked" | "sandboxed" | "requires_approval";
  appBuilding: "allowed" | "blocked";
  cloudUse: "blocked_local_codex" | "not_requested";
  fallbackAllowed: boolean;
  reasons: string[];
  deniedReason?: string;
};

export type CodexProjectionContext = {
  runId: string;
  actorAccountId: string;
  deviceId: string;
  target: CodexRuntimeMode;
  runtime: CodexRuntimeMode;
  startedAt: string;
};

export type CodexProjectionResult = {
  events: import("@/types/local-agent").LocalAgentLogEvent[];
  toolCalls: LocalAgentToolCall[];
  terminalStatus?: "complete" | "failed";
};
