import type { LocalAgentEventType, LocalAgentLogEvent, LocalAgentTaskKind, LocalAgentToolCall, RuntimeTarget } from "@/types/local-agent";
import type { CodexEngineStatus, CodexEngineStore, CodexPolicyDecision, CodexProjectionContext, CodexProjectionResult, CodexRuntimeMode } from "@/types/codex-engine";

export const BASICHOME_CODEX_ENGINE_STORAGE_KEY = "basichome:codex-engine:v1";

const DEFAULT_CODEX_PATH = "/Applications/Codex.app/Contents/Resources/codex";
const DEFAULT_CODEX_VERSION = "codex-cli 0.133.0";

export function createDefaultCodexEngineStore(): CodexEngineStore {
  return {
    schemaVersion: 1,
    status: {
      engineId: "codex",
      displayName: "Codex",
      available: true,
      installed: true,
      authenticated: true,
      state: "ready",
      cliPath: DEFAULT_CODEX_PATH,
      cliVersion: DEFAULT_CODEX_VERSION,
      appServerAvailable: false,
      execJsonAvailable: true,
      acpAdapterAvailable: false,
      authMode: "codex_local_account",
      costBearer: "user_codex_subscription",
      model: "gpt-5",
      reasoningEffort: "low",
      lastCheckedAt: new Date().toISOString(),
      reconnectHint: "Run `codex login` in the desktop environment if this account disconnects.",
    },
  };
}

export function readCodexEngineStore(): CodexEngineStore {
  if (typeof window === "undefined") {
    return createDefaultCodexEngineStore();
  }

  const stored = window.localStorage.getItem(BASICHOME_CODEX_ENGINE_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<CodexEngineStore>;
      if (parsed.schemaVersion === 1 && parsed.status?.engineId === "codex") {
        return parsed as CodexEngineStore;
      }
    } catch {
      window.localStorage.removeItem(BASICHOME_CODEX_ENGINE_STORAGE_KEY);
    }
  }

  const seeded = createDefaultCodexEngineStore();
  writeCodexEngineStore(seeded);
  return seeded;
}

export function writeCodexEngineStore(store: CodexEngineStore): CodexEngineStore {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASICHOME_CODEX_ENGINE_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function setCodexEngineReady(store: CodexEngineStore): CodexEngineStore {
  return {
    ...store,
    status: {
      ...store.status,
      available: true,
      installed: true,
      authenticated: true,
      state: "ready",
      cliPath: store.status.cliPath ?? DEFAULT_CODEX_PATH,
      cliVersion: store.status.cliVersion ?? DEFAULT_CODEX_VERSION,
      execJsonAvailable: true,
      authMode: "codex_local_account",
      costBearer: "user_codex_subscription",
      lastCheckedAt: new Date().toISOString(),
      installHint: undefined,
      reconnectHint: "Run `codex login` in the desktop environment if this account disconnects.",
    },
  };
}

export function setCodexEngineUnauthenticated(store: CodexEngineStore): CodexEngineStore {
  return {
    ...store,
    status: {
      ...store.status,
      available: false,
      installed: true,
      authenticated: false,
      state: "not_authenticated",
      execJsonAvailable: true,
      authMode: "codex_local_account",
      costBearer: "unknown_unavailable",
      lastCheckedAt: new Date().toISOString(),
      reconnectHint: "Reconnect with `codex login`; explicit Codex runs fail closed until auth is restored.",
    },
  };
}

export function setCodexEngineNotInstalled(store: CodexEngineStore): CodexEngineStore {
  return {
    ...store,
    status: {
      ...store.status,
      available: false,
      installed: false,
      authenticated: false,
      state: "not_installed",
      cliPath: undefined,
      cliVersion: undefined,
      appServerAvailable: false,
      execJsonAvailable: false,
      acpAdapterAvailable: false,
      authMode: "codex_local_account",
      costBearer: "unknown_unavailable",
      lastCheckedAt: new Date().toISOString(),
      installHint: "Install Codex locally, then connect it from basichome Engine settings.",
      reconnectHint: undefined,
    },
  };
}

export function isCodexReady(status: CodexEngineStatus): boolean {
  return status.available && status.installed && status.authenticated && status.state === "ready";
}

export function codexModeForTarget(target: RuntimeTarget): CodexRuntimeMode | undefined {
  if (target === "codex_app_server" || target === "codex_exec") return target;
  return undefined;
}

export function evaluateCodexPolicy(input: {
  prompt: string;
  mode: CodexRuntimeMode;
  taskKind: LocalAgentTaskKind;
  requestedTarget: RuntimeTarget;
  status: CodexEngineStatus;
}): CodexPolicyDecision {
  const reasons: string[] = [];
  const prompt = input.prompt.toLowerCase();
  const codeLike = input.taskKind === "build_app" || input.taskKind === "edit_app" || promptIncludesAny(prompt, ["code", "app", "tool", "workspace", "repo"]);
  const cloudRequested = input.taskKind === "deploy_app" || promptIncludesAny(prompt, ["deploy", "cloud", "overnight", "schedule"]);

  if (!isCodexReady(input.status)) {
    return {
      allowed: false,
      mode: input.mode,
      taskKind: input.taskKind,
      requestedTarget: input.requestedTarget,
      sandbox: "read-only",
      approvalPolicy: "blocked",
      filesystem: "none",
      network: "blocked",
      commandExecution: "blocked",
      appBuilding: codeLike ? "blocked" : "allowed",
      cloudUse: cloudRequested ? "blocked_local_codex" : "not_requested",
      fallbackAllowed: input.requestedTarget === "auto",
      reasons: [`Codex is ${input.status.state.replaceAll("_", " ")}.`],
      deniedReason: "Codex is unavailable or unauthenticated.",
    };
  }

  if (cloudRequested && input.requestedTarget !== "auto") {
    reasons.push("Local Codex cannot silently authorize cloud work; route deployment through Basics Cloud policy.");
  }
  if (codeLike) {
    reasons.push("Codex is allowed for developer/app-building work with Basics policy wrapping filesystem and commands.");
  } else {
    reasons.push("Codex is available, but non-code tasks should usually stay on Basics local or managed providers.");
  }

  return {
    allowed: true,
    mode: input.mode,
    taskKind: input.taskKind,
    requestedTarget: input.requestedTarget,
    sandbox: codeLike ? "workspace-write" : "read-only",
    approvalPolicy: codeLike ? "per_tool_approval" : "first_run_review",
    filesystem: codeLike ? "workspace_write" : "read_only",
    network: "blocked",
    commandExecution: codeLike ? "requires_approval" : "sandboxed",
    appBuilding: codeLike ? "allowed" : "blocked",
    cloudUse: cloudRequested ? "blocked_local_codex" : "not_requested",
    fallbackAllowed: input.requestedTarget === "auto",
    reasons,
  };
}

export function projectCodexJsonlEvents(lines: Array<string | Record<string, unknown>>, context: CodexProjectionContext): CodexProjectionResult {
  const events: LocalAgentLogEvent[] = [];
  const toolCalls = new Map<string, LocalAgentToolCall>();
  let terminalStatus: CodexProjectionResult["terminalStatus"];
  const base = new Date(context.startedAt).getTime();

  lines.forEach((line, index) => {
    const item = typeof line === "string" ? parseJsonObject(line) : line;
    if (!item) return;
    const type = readString(item.type);
    const createdAt = new Date(base + index * 100).toISOString();

    if (type === "thread.started") {
      events.push(createCodexEvent(context, "codex.thread.started", `Codex thread ${readString(item.thread_id) ?? "started"} is bound to the Basics run.`, createdAt, undefined, item));
      return;
    }
    if (type === "turn.started") {
      events.push(createCodexEvent(context, "codex.turn.started", "Codex turn started under Basics policy.", createdAt, undefined, item));
      return;
    }
    if (type === "turn.completed") {
      terminalStatus = "complete";
      events.push(createCodexEvent(context, "codex.exec.completed", "Codex turn completed and was projected into Basics logs.", createdAt, undefined, item));
      return;
    }
    if (type === "turn.failed" || type === "error") {
      terminalStatus = "failed";
      events.push(createCodexEvent(context, "codex.exec.failed", readErrorMessage(item) ?? "Codex execution failed.", createdAt, undefined, item));
      return;
    }
    if (type === "item.started" || type === "item.completed") {
      const rawItem = isRecord(item.item) ? item.item : item;
      const toolName = codexToolName(rawItem);
      if (!toolName) {
        events.push(createCodexEvent(context, "codex.exec.event", `Codex ${readString(rawItem.item_type) ?? "item"} ${type.endsWith("completed") ? "completed" : "started"}.`, createdAt, undefined, item));
        return;
      }
      const toolCallId = sanitizeToolCallId(readString(rawItem.id) ?? readString(rawItem.call_id) ?? `tool_codex_${index}`);
      const started = type === "item.started";
      const existing = toolCalls.get(toolCallId);
      toolCalls.set(toolCallId, {
        id: toolCallId,
        name: toolName,
        target: context.target,
        status: started ? "running" : "completed",
        startedAt: existing?.startedAt ?? createdAt,
        completedAt: started ? existing?.completedAt : createdAt,
        durationMs: started ? existing?.durationMs : Math.max(1, new Date(createdAt).getTime() - new Date(existing?.startedAt ?? createdAt).getTime()),
        args: codexToolArgs(rawItem),
        result: started ? existing?.result : { projected_from: "codex_jsonl" },
      });
      events.push(createCodexEvent(context, started ? "tool_call.started" : "tool_call.completed", `${toolName} ${started ? "started" : "completed"} in Codex.`, createdAt, toolCallId, item));
      return;
    }
    events.push(createCodexEvent(context, "codex.exec.event", `Codex event ${type ?? "unknown"} received.`, createdAt, undefined, item));
  });

  return {
    events,
    toolCalls: [...toolCalls.values()],
    terminalStatus,
  };
}

function createCodexEvent(
  context: CodexProjectionContext,
  type: LocalAgentEventType,
  message: string,
  createdAt: string,
  toolCallId: string | undefined,
  payload: Record<string, unknown>,
): LocalAgentLogEvent {
  return {
    id: `evt_codex_${context.runId}_${createdAt.replace(/\D/g, "")}_${type.replaceAll(".", "_")}`,
    type,
    message,
    runId: context.runId,
    actorAccountId: context.actorAccountId,
    deviceId: context.deviceId,
    toolCallId,
    target: context.target,
    runtime: context.runtime,
    source: "codex",
    privacyClass: "action_log",
    createdAt,
    payload,
  };
}

function codexToolName(item: Record<string, unknown>): string | undefined {
  const itemType = readString(item.item_type) ?? readString(item.type);
  if (itemType === "command_execution") return "codex.command_execution";
  if (itemType === "file_change") return "codex.file_change";
  if (itemType === "mcp_tool_call") return `codex.mcp.${readString(item.tool) ?? "tool"}`;
  if (itemType === "web_search") return "codex.web_search";
  return undefined;
}

function codexToolArgs(item: Record<string, unknown>): Record<string, unknown> {
  const command = readString(item.command);
  const query = readString(item.query);
  const path = readString(item.path);
  return {
    ...(command ? { command } : {}),
    ...(query ? { query } : {}),
    ...(path ? { path } : {}),
    item_type: readString(item.item_type) ?? readString(item.type) ?? "unknown",
  };
}

function readErrorMessage(item: Record<string, unknown>): string | undefined {
  const direct = readString(item.message);
  if (direct) return direct;
  const error = isRecord(item.error) ? item.error : undefined;
  return error ? readString(error.message) : undefined;
}

function sanitizeToolCallId(value: string): string {
  return value.startsWith("tool_") ? value : `tool_${value.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function promptIncludesAny(prompt: string, needles: string[]): boolean {
  return needles.some((needle) => new RegExp(`\\b${needle}\\b`, "i").test(prompt));
}

function parseJsonObject(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
