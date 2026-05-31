import { BASICHOME_ONBOARDING_STORAGE_KEY, type BasichomeOnboardingRecord } from "@/lib/onboarding";
import {
  browserTargetShortLabel,
  domainFromBrowserPrompt,
  normalizeBrowserDomain,
  readBrowserRuntimeStore,
  selectBrowserProfileForRun,
} from "@/lib/browser-runtime";
import { codexModeForTarget, evaluateCodexPolicy, isCodexReady, projectCodexJsonlEvents, readCodexEngineStore } from "@/lib/codex-engine";
import type {
  BasicsRunIntent,
  LocalAgentLogEvent,
  LocalAgentRun,
  LocalAgentRunStatus,
  LocalAgentStore,
  LocalAgentTaskKind,
  LocalAgentToolCall,
  RuntimeResolution,
  RuntimeSelection,
  RuntimeTarget,
} from "@/types/local-agent";
import type { BrowserRunStartOptions, BrowserRunState, BrowserRuntimeTarget } from "@/types/browser-runtime";
import type { CodexEngineStatus, CodexPolicyDecision } from "@/types/codex-engine";
import type { Run, RunStatus, RunStep } from "@/types/runs";

export const BASICHOME_LOCAL_AGENT_STORAGE_KEY = "basichome:local-agent-runtime:v1";

const DEFAULT_WORKSPACE_ID = "workspace_local";
const DEFAULT_ACTOR_ACCOUNT_ID = "local-dev-owner";
const DEFAULT_DEVICE_ID = "device_local_dev";
const MAX_RUNS = 24;

export function createInitialLocalAgentStore(): LocalAgentStore {
  return {
    schemaVersion: 1,
    runs: [],
  };
}

export function readLocalAgentStore(): LocalAgentStore {
  if (typeof window === "undefined") {
    return createInitialLocalAgentStore();
  }

  const stored = window.localStorage.getItem(BASICHOME_LOCAL_AGENT_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<LocalAgentStore>;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.runs)) {
        return parsed as LocalAgentStore;
      }
    } catch {
      window.localStorage.removeItem(BASICHOME_LOCAL_AGENT_STORAGE_KEY);
    }
  }

  const seeded = createInitialLocalAgentStore();
  writeLocalAgentStore(seeded);
  return seeded;
}

export function writeLocalAgentStore(store: LocalAgentStore): LocalAgentStore {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASICHOME_LOCAL_AGENT_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function startLocalAgentRun(
  store: LocalAgentStore,
  prompt: string,
  requestedTarget: RuntimeTarget = "auto",
  taskKind?: LocalAgentTaskKind,
  options: BrowserRunStartOptions = {},
): LocalAgentStore {
  const onboarding = readOnboardingRecord();
  const workspaceId = onboarding?.workspace.id ?? DEFAULT_WORKSPACE_ID;
  const actorAccountId = onboarding?.device.localProfileId ?? DEFAULT_ACTOR_ACCOUNT_ID;
  const deviceId = onboarding?.device.id ?? DEFAULT_DEVICE_ID;
  const runId = createLocalId("run_local");
  const startedAt = new Date().toISOString();
  const resolvedTaskKind = taskKind ?? inferTaskKind(prompt, requestedTarget);
  const intent: BasicsRunIntent = {
    source: "dashboard",
    taskKind: resolvedTaskKind,
    prompt,
    requestedTarget,
    browserRuntimeTarget: options.browserRuntimeTarget ?? "auto",
    workspaceId,
    localDeviceId: deviceId,
  };
  const codexStatus = readCodexEngineStore().status;
  const browserStore = readBrowserRuntimeStore();
  const resolution = resolveRuntime(runId, intent, codexStatus, options);
  const browser = createBrowserRunState(resolution, prompt, options, browserStore);
  const codexPolicy = codexModeForTarget(resolution.selectedTarget)
    ? evaluateCodexPolicy({
        prompt,
        mode: resolution.selectedTarget === "codex_exec" ? "codex_exec" : "codex_app_server",
        taskKind: resolvedTaskKind,
        requestedTarget,
        status: codexStatus,
      })
    : undefined;
  const toolCalls = createToolCalls(resolution, prompt, startedAt, codexStatus, codexPolicy, browser);
  const events = createRunEvents(runId, actorAccountId, deviceId, resolution, prompt, toolCalls, startedAt, codexStatus, codexPolicy, browser);
  const activeToolCall = toolCalls.find((tool) => tool.status === "running");
  const failedByPolicy = Boolean(codexPolicy && !codexPolicy.allowed && requestedTarget !== "auto");

  const run: LocalAgentRun = {
    runId,
    workspaceId,
    actorAccountId,
    deviceId,
    taskTitle: titleFromPrompt(prompt),
    prompt,
    status: failedByPolicy ? "failed" : "running",
    overlayStatus: failedByPolicy ? "failed" : "running",
    intent,
    resolution,
    browser,
    toolCalls,
    events,
    activeToolCallId: failedByPolicy ? undefined : activeToolCall?.id,
    startedAt,
    updatedAt: startedAt,
    completedAt: failedByPolicy ? startedAt : undefined,
  };

  return limitRuns({
    ...store,
    activeRunId: runId,
    runs: [run, ...store.runs],
  });
}

export function pauseLocalAgentRun(store: LocalAgentStore, runId: string): LocalAgentStore {
  return updateRun(store, runId, (run) => {
    const now = new Date().toISOString();
    const toolCalls = run.toolCalls.map((tool) => (tool.id === run.activeToolCallId ? { ...tool, status: "paused" as const } : tool));
    const next = {
      ...run,
      status: "paused" as const,
      overlayStatus: "paused" as const,
      toolCalls,
      updatedAt: now,
    };
    return appendRunEvent(next, "run.paused", "Paused by the user from Basics.", "client", now);
  });
}

export function resumeLocalAgentRun(store: LocalAgentStore, runId: string): LocalAgentStore {
  return updateRun(store, runId, (run) => {
    const now = new Date().toISOString();
    const toolCalls = run.toolCalls.map((tool) => (tool.id === run.activeToolCallId ? { ...tool, status: "running" as const } : tool));
    const next = {
      ...run,
      status: "running" as const,
      overlayStatus: "running" as const,
      toolCalls,
      updatedAt: now,
    };
    return appendRunEvent(next, "run.resumed", "Resumed local agent work.", "client", now);
  });
}

export function stopLocalAgentRun(store: LocalAgentStore, runId: string): LocalAgentStore {
  return updateRun(store, runId, (run) => {
    const now = new Date().toISOString();
    const toolCalls = run.toolCalls.map((tool) =>
      tool.status === "running" || tool.status === "queued"
        ? {
            ...tool,
            status: "completed" as const,
            completedAt: now,
            durationMs: tool.startedAt ? Math.max(1, new Date(now).getTime() - new Date(tool.startedAt).getTime()) : 1,
            result: { stopped_by_user: true },
          }
        : tool,
    );
    const next = {
      ...run,
      status: "stopped" as const,
      overlayStatus: "complete" as const,
      toolCalls,
      completedAt: now,
      updatedAt: now,
    };
    const stopped = appendRunEvent(next, "run.stopped", "Stopped by the user. Logs remain available for replay.", "client", now);
    return { ...stopped, activeToolCallId: undefined };
  });
}

export function promoteLocalAgentRunToCloud(store: LocalAgentStore, runId: string): LocalAgentStore {
  return updateRun(store, runId, (run) => {
    const now = new Date().toISOString();
    const resolution: RuntimeResolution = {
      ...run.resolution,
      selectedTarget: "basics_cloud",
      runtime: "basics_cloud_worker",
      browserRuntimeTarget: run.browser ? "basics_cloud_browser" : run.resolution.browserRuntimeTarget,
      authMode: "workspace_managed_credits",
      costBearer: "workspace_credits",
      approvalPolicy: "cloud_promotion_required",
      fallbackTargets: ["local_device"],
      reason: run.browser ? "User promoted the browser task to Basics Cloud Browser for durable/background execution." : "User promoted the run to Basics Cloud for durable/background execution.",
    };
    const browser: BrowserRunState | undefined = run.browser
      ? {
          ...run.browser,
          runtimeTarget: "basics_cloud_browser",
          status: "promoting_to_cloud",
          liveViewUrl: `https://cloud.trybasics.ai/live/${run.runId}`,
          cloudPromotionStatus: "approval_required",
          viewMode: "watching",
        }
      : undefined;
    const next = {
      ...run,
      status: "waiting_for_approval" as const,
      overlayStatus: "waiting_for_approval" as const,
      resolution,
      browser,
      toolCalls: run.toolCalls.map((tool) => ({ ...tool, target: "basics_cloud" as const })),
      updatedAt: now,
    };
    const promoted = appendRunEvent(next, "run.promoted_to_cloud", run.browser ? "Basics Cloud Browser promotion queued for approval." : "Cloud promotion queued for approval.", "client", now, {
      approval_policy: resolution.approvalPolicy,
      cost_bearer: resolution.costBearer,
      browser_runtime_target: browser?.runtimeTarget,
      domain: browser?.domain,
    });
    if (!browser) return promoted;
    return appendRunEvent(promoted, "browser.cloud.promotion_queued", "Selected browser profile requires approval before cloud use.", "client", now, {
      domain: browser.domain,
      live_view_url: browser.liveViewUrl,
      profile_id: browser.profileId,
      copied_context: "selected-site cookies and localStorage only after approval",
    });
  });
}

export function watchLocalBrowserRun(store: LocalAgentStore, runId: string): LocalAgentStore {
  return updateRun(store, runId, (run) => {
    if (!run.browser) return run;
    const now = new Date().toISOString();
    const next = {
      ...run,
      browser: {
        ...run.browser,
        viewMode: "watching" as const,
      },
      updatedAt: now,
    };
    return appendRunEvent(next, "browser.live_view.opened", "Browser live view opened for watch mode.", "client", now, {
      url: run.browser.currentUrl,
      domain: run.browser.domain,
      screenshot_ref: run.browser.screenshotRef,
    });
  });
}

export function takeOverLocalBrowserRun(store: LocalAgentStore, runId: string): LocalAgentStore {
  return updateRun(store, runId, (run) => {
    if (!run.browser) return run;
    const now = new Date().toISOString();
    const toolCalls = run.toolCalls.map((tool) => (tool.id === run.activeToolCallId ? { ...tool, status: "paused" as const } : tool));
    const next = {
      ...run,
      status: "paused" as const,
      overlayStatus: "paused" as const,
      browser: {
        ...run.browser,
        viewMode: "user_takeover" as const,
      },
      toolCalls,
      updatedAt: now,
    };
    return appendRunEvent(next, "browser.takeover.enabled", "User took over the browser; agent tool dispatch is paused.", "client", now, {
      url: run.browser.currentUrl,
      domain: run.browser.domain,
      runtime_target: run.browser.runtimeTarget,
    });
  });
}

export function completeLocalAgentRun(store: LocalAgentStore, runId: string): LocalAgentStore {
  return updateRun(store, runId, (run) => {
    const now = new Date().toISOString();
    const next = {
      ...run,
      status: "complete" as const,
      overlayStatus: "complete" as const,
      completedAt: now,
      updatedAt: now,
    };
    const completed = appendRunEvent(next, "run.completed", "Local task completed.", "agent", now);
    return { ...completed, activeToolCallId: undefined };
  });
}

export function getActiveLocalAgentRun(store: LocalAgentStore): LocalAgentRun | undefined {
  return store.runs.find((run) => run.runId === store.activeRunId);
}

export function findLocalAgentRun(store: LocalAgentStore, runId: string): LocalAgentRun | undefined {
  return store.runs.find((run) => run.runId === runId);
}

export function listLocalAgentLogs(store: LocalAgentStore): LocalAgentLogEvent[] {
  return store.runs
    .flatMap((run) => run.events)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function localAgentRunToRun(run: LocalAgentRun): Run {
  return {
    id: run.runId,
    workflowId: "wf_local_agent",
    workflowName: run.taskTitle,
    workspaceId: run.workspaceId,
    status: mapLocalStatus(run.status),
    trigger: "manual",
    triggeredBy: { id: run.actorAccountId, name: "basichome local owner" },
    takeoverActive: false,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    costCents: run.resolution.costBearer === "workspace_credits" ? 2 : 0,
    stepCount: run.events.length,
    runtime: run.resolution.runtime,
    executionTarget: run.resolution.selectedTarget,
    actorAccountId: run.actorAccountId,
    deviceId: run.deviceId,
    authMode: run.resolution.authMode,
    costBearer: run.resolution.costBearer,
    activeTool: run.toolCalls.find((tool) => tool.id === run.activeToolCallId)?.name,
    browserRuntimeTarget: run.resolution.browserRuntimeTarget,
    browserUrl: run.browser?.currentUrl,
    browserTitle: run.browser?.pageTitle,
    browserDomain: run.browser?.domain,
    liveUrl: run.browser?.liveViewUrl,
    browserbaseSessionId: run.browser?.runtimeTarget === "basics_cloud_browser" ? `bb_${run.runId.slice(-8)}` : undefined,
  };
}

export function localAgentRunToSteps(run: LocalAgentRun): RunStep[] {
  return run.events.map((event, index): RunStep => {
    if (event.type === "tool_call.started" || event.type === "tool_call.completed") {
      const tool = run.toolCalls.find((call) => call.id === event.toolCallId);
      return {
        id: event.id,
        runId: run.runId,
        stepIndex: index + 1,
        kind: "tool_call",
        payload: {
          kind: "tool_call",
          toolName: tool?.name ?? "tool_call",
          params: tool?.args ?? {},
          result: tool?.result,
          durationMs: tool?.durationMs ?? 1,
        },
        createdAt: event.createdAt,
      };
    }

    if (event.type === "approval.required" || event.type === "run.promoted_to_cloud") {
      return {
        id: event.id,
        runId: run.runId,
        stepIndex: index + 1,
        kind: "approval",
        payload: {
          kind: "approval",
          approvalId: event.id,
          action: "cloud_promotion",
          status: "pending",
        },
        createdAt: event.createdAt,
      };
    }

    const engineEvent = event.type.startsWith("codex.") || event.type.startsWith("engine.") || event.type.startsWith("policy.") || event.type.startsWith("browser.") || event.type === "run.fallback.selected";

    return {
      id: event.id,
      runId: run.runId,
      stepIndex: index + 1,
      kind: event.type === "agent.thinking" || event.type === "runtime.route.resolved" || engineEvent ? "model_tool_use" : "model_thinking",
      payload:
        event.type === "runtime.route.resolved" || engineEvent
          ? { kind: "model_tool_use", toolName: event.type === "runtime.route.resolved" ? "runtime_router" : event.type.replaceAll(".", "_"), reasoning: event.message }
          : { kind: "model_thinking", text: event.message },
      createdAt: event.createdAt,
    };
  });
}

export function requiredLogFieldsPresent(event: LocalAgentLogEvent): boolean {
  return Boolean(event.runId && event.actorAccountId && event.deviceId && event.target && event.createdAt && event.runtime);
}

function updateRun(store: LocalAgentStore, runId: string, updater: (run: LocalAgentRun) => LocalAgentRun): LocalAgentStore {
  let activeRunId = store.activeRunId;
  const runs = store.runs.map((run) => {
    if (run.runId !== runId) return run;
    const next = updater(run);
    if (next.status === "complete" || next.status === "failed" || next.status === "stopped") {
      activeRunId = next.runId;
    }
    return next;
  });
  return { ...store, activeRunId, runs };
}

function resolveRuntime(runId: string, intent: BasicsRunIntent, codexStatus: CodexEngineStatus, options: BrowserRunStartOptions): RuntimeResolution {
  const selectedTarget = resolveTarget(intent, codexStatus, options);
  const runtime = runtimeForTarget(selectedTarget);
  const cloud = selectedTarget === "basics_cloud";
  const codex = selectedTarget === "codex_app_server" || selectedTarget === "codex_exec";
  const codexReady = isCodexReady(codexStatus);
  const browserRuntimeTarget = intent.taskKind === "browser_task" ? resolveBrowserRuntimeTarget(intent, selectedTarget, options) : undefined;
  const activeBrowser = browserRuntimeTarget === "local_visible_browser";
  return {
    runId,
    selectedTarget,
    provider: codex ? "codex" : "basics",
    model: codex ? codexStatus.model : cloud ? "Basics Cloud Worker" : "Basics Local",
    runtime,
    browserRuntimeTarget,
    authMode: codex
      ? codexReady
        ? "local_codex_account"
        : "unknown_unavailable"
      : cloud
        ? "workspace_managed_credits"
        : browserRuntimeTarget
          ? activeBrowser
            ? "active_browser_user_account"
            : "local_browser_profile"
          : "local_included",
    costBearer: codex ? (codexReady ? "user_codex_subscription" : "unknown_unavailable") : cloud ? "workspace_credits" : "included_local",
    contextSource: intent.taskKind === "screen_help" ? "current_screen" : intent.taskKind === "build_app" || intent.taskKind === "edit_app" ? "app_data" : "lens_distilled",
    approvalPolicy: codex ? (codexReady ? "codex_policy_gate_required" : "fail_closed") : cloud ? "cloud_promotion_required" : "first_run_review",
    fallbackTargets: fallbackTargetsFor(selectedTarget),
    reason: routeReason(intent, selectedTarget, codexStatus, browserRuntimeTarget),
  };
}

function resolveTarget(intent: BasicsRunIntent, codexStatus: CodexEngineStatus, options: BrowserRunStartOptions): Exclude<RuntimeTarget, "auto"> {
  if (intent.requestedTarget !== "auto") return intent.requestedTarget;
  const prompt = intent.prompt.toLowerCase();
  if (intent.taskKind === "browser_task" && options.browserRuntimeTarget === "basics_cloud_browser") return "basics_cloud";
  if (prompt.includes("overnight") || prompt.includes("schedule") || prompt.includes("while i am away") || prompt.includes("background")) {
    return "basics_cloud";
  }
  if (intent.taskKind === "browser_task" || prompt.includes("browser") || prompt.includes("website") || prompt.includes("page")) {
    return "local_browser";
  }
  if (intent.taskKind === "build_app" || intent.taskKind === "edit_app" || hasWord(prompt, "app") || hasWord(prompt, "tool") || hasWord(prompt, "code") || hasWord(prompt, "workspace")) {
    return isCodexReady(codexStatus) ? "codex_app_server" : "local_app";
  }
  return "local_device";
}

function resolveBrowserRuntimeTarget(intent: BasicsRunIntent, selectedTarget: Exclude<RuntimeTarget, "auto">, options: BrowserRunStartOptions): BrowserRuntimeTarget {
  if (options.browserRuntimeTarget) return options.browserRuntimeTarget;
  if (selectedTarget === "basics_cloud") return "basics_cloud_browser";
  if (intent.browserRuntimeTarget && intent.browserRuntimeTarget !== "auto") return intent.browserRuntimeTarget;
  return "local_managed_browser";
}

function runtimeForTarget(target: Exclude<RuntimeTarget, "auto">): RuntimeSelection {
  if (target === "local_browser") return "basics_local_browser";
  if (target === "local_app") return "basics_local_app";
  if (target === "codex_app_server") return "codex_app_server";
  if (target === "codex_exec") return "codex_exec";
  if (target === "basics_cloud") return "basics_cloud_worker";
  return "basics_local_runner";
}

function fallbackTargetsFor(target: Exclude<RuntimeTarget, "auto">): Array<Exclude<RuntimeTarget, "auto">> {
  if (target === "codex_app_server") return ["codex_exec", "local_app", "basics_cloud"];
  if (target === "codex_exec") return ["local_app", "basics_cloud"];
  if (target === "basics_cloud") return ["local_device"];
  return ["basics_cloud"];
}

function routeReason(intent: BasicsRunIntent, target: Exclude<RuntimeTarget, "auto">, codexStatus: CodexEngineStatus, browserRuntimeTarget?: BrowserRuntimeTarget): string {
  if (intent.requestedTarget !== "auto") {
    if (browserRuntimeTarget) return `User selected ${browserTargetShortLabel(browserRuntimeTarget)}.`;
    return `User selected ${target}.`;
  }
  if (target === "basics_cloud") return browserRuntimeTarget === "basics_cloud_browser" ? "Auto-routed to Basics Cloud Browser because the task needs scheduled, overnight, or durable browser execution." : "Auto-routed to cloud because the task implies scheduled, overnight, or background reliability.";
  if (target === "codex_app_server") return "Auto-routed to Codex app-server because the task is app/code/workspace work and local Codex is ready.";
  if (target === "codex_exec") return "Auto-routed to Codex exec JSON because the task is non-interactive developer work.";
  if (target === "local_browser") return "Auto-routed to managed local browser because the task mentions browser/page work and the desktop is available.";
  if (target === "local_app" && !isCodexReady(codexStatus)) return `Auto-routed to local app runtime because Codex is ${codexStatus.state.replaceAll("_", " ")}.`;
  if (target === "local_app") return "Auto-routed to local app runtime because the task mentions app/tool work.";
  return "Auto-routed to local device for immediate local-first assistance.";
}

function inferTaskKind(prompt: string, requestedTarget: RuntimeTarget): LocalAgentTaskKind {
  const lower = prompt.toLowerCase();
  if (requestedTarget === "local_browser" || lower.includes("browser") || lower.includes("website") || lower.includes("page")) return "browser_task";
  if (lower.includes("deploy")) return "deploy_app";
  if (requestedTarget === "codex_app_server" || requestedTarget === "codex_exec" || requestedTarget === "local_app" || hasWord(lower, "build") || hasWord(lower, "app") || hasWord(lower, "tool") || hasWord(lower, "code")) return "build_app";
  if (lower.includes("screen") || lower.includes("looking at")) return "screen_help";
  if (lower.includes("automation") || lower.includes("routine")) return "run_automation";
  if (lower.includes("csv") || lower.includes("data") || lower.includes("sheet")) return "data_task";
  return "chat";
}

function createBrowserRunState(
  resolution: RuntimeResolution,
  prompt: string,
  options: BrowserRunStartOptions,
  browserStore: ReturnType<typeof readBrowserRuntimeStore>,
): BrowserRunState | undefined {
  const runtimeTarget = resolution.browserRuntimeTarget;
  if (!runtimeTarget) return undefined;

  const domain = normalizeBrowserDomain(options.browserDomain ?? domainFromBrowserPrompt(prompt));
  const profile = selectBrowserProfileForRun(browserStore, runtimeTarget, {
    ...options,
    browserDomain: domain,
  });
  const loginRequired = Boolean(options.requiresLogin || (runtimeTarget === "local_managed_browser" && profile?.status === "needs_login"));
  const currentUrl = options.browserUrl ?? `https://${domain}/`;
  const pageTitle = options.browserTitle ?? pageTitleForDomain(domain, loginRequired);
  const screenshotRef =
    runtimeTarget === "basics_cloud_browser"
      ? `basics-cloud-browser://${domain}/${resolution.runId}/initial-frame.png`
      : `local-browser://${domain}/${resolution.runId}/initial-frame.png`;
  const liveViewUrl =
    runtimeTarget === "basics_cloud_browser"
      ? `https://cloud.trybasics.ai/live/${resolution.runId}`
      : runtimeTarget === "local_visible_browser"
        ? "active-browser://selected-window"
        : `local-browser://${resolution.runId}`;

  return {
    runtimeTarget,
    profileId: profile?.id,
    profilePath: profile?.storagePath,
    domain,
    currentUrl,
    pageTitle,
    status: loginRequired ? "needs_login" : "running",
    liveViewUrl,
    screenshotRef,
    cookieCount: profile?.cookieCount,
    localStorageKeyCount: profile?.localStorageKeyCount,
    loginRequired,
    viewMode: "agent_control",
    cloudPromotionStatus: runtimeTarget === "basics_cloud_browser" ? "approval_required" : "not_requested",
  };
}

function pageTitleForDomain(domain: string, loginRequired: boolean): string {
  if (loginRequired) return `Sign in to ${domain}`;
  if (domain === "news.ycombinator.com") return "Hacker News";
  if (domain === "app.hubspot.com") return "HubSpot contacts";
  if (domain === "app.qbo.intuit.com") return "QuickBooks invoices";
  if (domain === "jobboardpro.example") return "JobBoard Pro";
  return domain;
}

function createToolCalls(
  resolution: RuntimeResolution,
  prompt: string,
  startedAt: string,
  codexStatus: CodexEngineStatus,
  codexPolicy: CodexPolicyDecision | undefined,
  browser: BrowserRunState | undefined,
): LocalAgentToolCall[] {
  const firstToolId = createLocalId("tool");
  const secondToolId = createLocalId("tool");
  const activeToolId = createLocalId("tool");
  const started = new Date(startedAt).getTime();
  const codexTarget = resolution.selectedTarget === "codex_app_server" || resolution.selectedTarget === "codex_exec";

  if (codexTarget && codexPolicy && !codexPolicy.allowed) {
    return [
      {
        id: firstToolId,
        name: "codex.availability_check",
        target: resolution.selectedTarget,
        status: "failed",
        startedAt,
        completedAt: new Date(started + 120).toISOString(),
        durationMs: 120,
        args: { engine: "codex", requested_target: resolution.selectedTarget },
        result: { state: codexStatus.state, denied_reason: codexPolicy.deniedReason },
      },
    ];
  }

  if (codexTarget) {
    return [
      {
        id: firstToolId,
        name: "codex.policy_gate",
        target: resolution.selectedTarget,
        status: "completed",
        startedAt,
        completedAt: new Date(started + 220).toISOString(),
        durationMs: 220,
        args: { sandbox: codexPolicy?.sandbox, approval_policy: codexPolicy?.approvalPolicy },
        result: {
          allowed: codexPolicy?.allowed ?? false,
          filesystem: codexPolicy?.filesystem,
          command_execution: codexPolicy?.commandExecution,
          network: codexPolicy?.network,
          cloud_use: codexPolicy?.cloudUse,
        },
      },
      {
        id: secondToolId,
        name: resolution.selectedTarget === "codex_app_server" ? "codex.app_server.turn" : "codex.exec_json",
        target: resolution.selectedTarget,
        status: "running",
        startedAt: new Date(started + 360).toISOString(),
        args: {
          prompt_preview: prompt.slice(0, 120),
          model: resolution.model,
          mode: resolution.runtime,
        },
      },
    ];
  }

  if (browser) {
    return [
      {
        id: firstToolId,
        name: "browser.profile_select",
        target: resolution.selectedTarget,
        status: "completed",
        startedAt,
        completedAt: new Date(started + 240).toISOString(),
        durationMs: 240,
        args: { domain: browser.domain, runtime_target: browser.runtimeTarget },
        result: {
          profile_id: browser.profileId,
          profile_path: browser.profilePath,
          cookie_count: browser.cookieCount ?? 0,
          device_only: browser.runtimeTarget !== "basics_cloud_browser",
        },
      },
      {
        id: secondToolId,
        name: browser.loginRequired ? "browser.login_prompt" : "browser.open_page",
        target: resolution.selectedTarget,
        status: browser.loginRequired ? "queued" : "completed",
        startedAt: new Date(started + 320).toISOString(),
        completedAt: browser.loginRequired ? undefined : new Date(started + 620).toISOString(),
        durationMs: browser.loginRequired ? undefined : 300,
        args: {
          url: browser.currentUrl,
          domain: browser.domain,
          profile_id: browser.profileId,
        },
        result: browser.loginRequired ? undefined : { page_title: browser.pageTitle, screenshot_ref: browser.screenshotRef },
      },
      {
        id: activeToolId,
        name: "browser.perform_task",
        target: resolution.selectedTarget,
        status: browser.loginRequired ? "queued" : "running",
        startedAt: new Date(started + 700).toISOString(),
        args: { prompt_preview: prompt.slice(0, 120), live_view_url: browser.liveViewUrl },
      },
    ];
  }

  return [
    {
      id: firstToolId,
      name: "context.query_approved",
      target: resolution.selectedTarget,
      status: "completed",
      startedAt,
      completedAt: new Date(started + 320).toISOString(),
      durationMs: 320,
      args: { source: resolution.contextSource },
      result: { summaries: 2, raw_items_returned: 0 },
    },
    {
      id: secondToolId,
      name: "runtime.route",
      target: resolution.selectedTarget,
      status: "completed",
      startedAt: new Date(started + 360).toISOString(),
      completedAt: new Date(started + 510).toISOString(),
      durationMs: 150,
      args: { requested_target: "auto" },
      result: { selected_target: resolution.selectedTarget, runtime: resolution.runtime },
    },
    {
      id: activeToolId,
      name:
        resolution.selectedTarget === "local_browser"
          ? "browser.inspect_page"
          : resolution.selectedTarget === "local_app"
            ? "app.inspect_manifest"
            : "agent.plan_next_action",
      target: resolution.selectedTarget,
      status: "running",
      startedAt: new Date(started + 620).toISOString(),
      args: { prompt_preview: prompt.slice(0, 120) },
    },
  ];
}

function createRunEvents(
  runId: string,
  actorAccountId: string,
  deviceId: string,
  resolution: RuntimeResolution,
  prompt: string,
  toolCalls: LocalAgentToolCall[],
  startedAt: string,
  codexStatus: CodexEngineStatus,
  codexPolicy: CodexPolicyDecision | undefined,
  browser: BrowserRunState | undefined,
): LocalAgentLogEvent[] {
  const base = new Date(startedAt).getTime();
  const event = (
    type: LocalAgentLogEvent["type"],
    message: string,
    deltaMs: number,
    source: LocalAgentLogEvent["source"],
    toolCallId?: string,
    payload?: Record<string, unknown>,
  ): LocalAgentLogEvent => ({
    id: createLocalId("evt"),
    type,
    message,
    runId,
    actorAccountId,
    deviceId,
    toolCallId,
    target: resolution.selectedTarget,
    runtime: resolution.runtime,
    source,
    privacyClass: "action_log",
    createdAt: new Date(base + deltaMs).toISOString(),
    payload,
  });

  const commonEvents = [
    event("run.accepted", "Basics accepted the run and returned a run_id immediately.", 0, "client", undefined, { prompt_preview: prompt.slice(0, 120) }),
    event("runtime.route.resolved", resolution.reason, 120, "agent", undefined, {
      selected_target: resolution.selectedTarget,
      runtime: resolution.runtime,
      auth_mode: resolution.authMode,
      cost_bearer: resolution.costBearer,
      browser_runtime_target: resolution.browserRuntimeTarget,
    }),
  ];

  if (codexPolicy) {
    commonEvents.push(
      event("engine.status.checked", `Codex engine status is ${codexStatus.state.replaceAll("_", " ")}.`, 180, "client", undefined, {
        installed: codexStatus.installed,
        authenticated: codexStatus.authenticated,
        cli_version: codexStatus.cliVersion,
        app_server_available: codexStatus.appServerAvailable,
        exec_json_available: codexStatus.execJsonAvailable,
      }),
      event("policy.gate.evaluated", codexPolicy.allowed ? "Basics policy allowed Codex under scoped local trust." : (codexPolicy.deniedReason ?? "Basics policy blocked Codex."), 220, "agent", toolCalls[0]?.id, {
        sandbox: codexPolicy.sandbox,
        approval_policy: codexPolicy.approvalPolicy,
        filesystem: codexPolicy.filesystem,
        network: codexPolicy.network,
        command_execution: codexPolicy.commandExecution,
        app_building: codexPolicy.appBuilding,
        cloud_use: codexPolicy.cloudUse,
        reasons: codexPolicy.reasons,
      }),
    );

    if (!codexPolicy.allowed) {
      commonEvents.push(
        event("engine.unavailable", codexPolicy.deniedReason ?? "Codex is unavailable.", 320, "client", toolCalls[0]?.id, {
          fallback_allowed: codexPolicy.fallbackAllowed,
          state: codexStatus.state,
        }),
        event("run.failed", "Explicit Codex run failed closed instead of silently falling back.", 360, "agent", toolCalls[0]?.id),
      );
      return commonEvents;
    }

    const codexToolId = toolCalls[1]?.id ?? createLocalId("tool");
    const projected = projectCodexJsonlEvents(
      [
        { type: "thread.started", thread_id: `thread_${runId.slice(-8)}` },
        { type: "turn.started" },
        {
          type: "item.started",
          item: {
            id: codexToolId,
            item_type: resolution.selectedTarget === "codex_exec" ? "command_execution" : "file_change",
            command: resolution.selectedTarget === "codex_exec" ? "codex exec --json" : undefined,
            path: resolution.selectedTarget === "codex_app_server" ? "apps/basichome-draft" : undefined,
          },
        },
      ],
      {
        runId,
        actorAccountId,
        deviceId,
        target: resolution.selectedTarget === "codex_exec" ? "codex_exec" : "codex_app_server",
        runtime: resolution.selectedTarget === "codex_exec" ? "codex_exec" : "codex_app_server",
        startedAt: new Date(base + 360).toISOString(),
      },
    );

    return [
      ...commonEvents,
      event("agent.thinking", "Built a distilled app/workspace context bundle for Codex without raw Lens data.", 300, "agent"),
      event("tool_call.started", `${toolCalls[0]?.name ?? "codex.policy_gate"} started.`, 320, "agent", toolCalls[0]?.id),
      event("tool_call.completed", `${toolCalls[0]?.name ?? "codex.policy_gate"} completed.`, 340, "agent", toolCalls[0]?.id, {
        allowed: true,
      }),
      ...projected.events,
    ];
  }

  if (resolution.selectedTarget === "local_app" && resolution.reason.includes("Codex is")) {
    commonEvents.push(
      event("run.fallback.selected", "Auto mode fell back from Codex to the local app runtime.", 180, "agent", undefined, {
        fallback_from: "codex_app_server",
        selected_target: "local_app",
      }),
    );
  }

  if (browser) {
    const browserEvents = [
      event("browser.profile.selected", `Selected ${browserTargetShortLabel(browser.runtimeTarget)} profile for ${browser.domain}.`, 180, "browser", toolCalls[0]?.id, {
        domain: browser.domain,
        profile_id: browser.profileId,
        profile_path: browser.profilePath,
        cookie_count: browser.cookieCount ?? 0,
        local_storage_keys: browser.localStorageKeyCount ?? 0,
        device_only: browser.runtimeTarget !== "basics_cloud_browser",
      }),
    ];

    if (browser.loginRequired) {
      return [
        ...commonEvents,
        ...browserEvents,
        event("browser.login.required", "Managed browser opened to the login screen; no credentials are stored until the user completes sign-in.", 280, "browser", toolCalls[1]?.id, {
          url: browser.currentUrl,
          domain: browser.domain,
          profile_id: browser.profileId,
        }),
        event("approval.required", "User must sign in inside the managed local browser before this browser task can continue.", 320, "client", toolCalls[1]?.id, {
          approval_kind: "browser_login",
          domain: browser.domain,
        }),
      ];
    }

    return [
      ...commonEvents,
      ...browserEvents,
      event("browser.session.started", `Started ${browserTargetShortLabel(browser.runtimeTarget)} session.`, 260, "browser", toolCalls[1]?.id, {
        live_view_url: browser.liveViewUrl,
        runtime_target: browser.runtimeTarget,
      }),
      event("browser.page.loaded", `Loaded ${browser.pageTitle}.`, 420, "browser", toolCalls[1]?.id, {
        url: browser.currentUrl,
        domain: browser.domain,
      }),
      event("browser.action.performed", "Browser task is running with watch, take-over, stop, and cloud promotion controls available.", 620, "browser", toolCalls[2]?.id, {
        action: "inspect_page",
        url: browser.currentUrl,
      }),
      event("browser.screenshot.saved", "Screenshot pointer recorded without storing pixels in the log row.", 660, "browser", toolCalls[2]?.id, {
        screenshot_ref: browser.screenshotRef,
        url: browser.currentUrl,
      }),
      event("tool_call.started", `${toolCalls[2]?.name ?? "browser.perform_task"} is running.`, 700, "agent", toolCalls[2]?.id, {
        url: browser.currentUrl,
        domain: browser.domain,
      }),
    ];
  }

  return [
    ...commonEvents,
    event("agent.thinking", "Gathered approved Lens summaries and planned the first local action.", 240, "agent"),
    event("tool_call.started", `${toolCalls[0]?.name ?? "tool"} started.`, 320, "agent", toolCalls[0]?.id),
    event("tool_call.completed", `${toolCalls[0]?.name ?? "tool"} completed with no raw context returned.`, 520, "agent", toolCalls[0]?.id, { raw_items_returned: 0 }),
    event("tool_call.started", `${toolCalls[1]?.name ?? "tool"} started.`, 560, "agent", toolCalls[1]?.id),
    event("tool_call.completed", `${toolCalls[1]?.name ?? "tool"} selected ${resolution.selectedTarget}.`, 720, "agent", toolCalls[1]?.id),
    event("tool_call.started", `${toolCalls[2]?.name ?? "tool"} is running.`, 860, "agent", toolCalls[2]?.id),
  ];
}

function appendRunEvent(
  run: LocalAgentRun,
  type: LocalAgentLogEvent["type"],
  message: string,
  source: LocalAgentLogEvent["source"],
  createdAt: string,
  payload?: Record<string, unknown>,
): LocalAgentRun {
  const event: LocalAgentLogEvent = {
    id: createLocalId("evt"),
    type,
    message,
    runId: run.runId,
    actorAccountId: run.actorAccountId,
    deviceId: run.deviceId,
    toolCallId: run.activeToolCallId,
    target: run.resolution.selectedTarget,
    runtime: run.resolution.runtime,
    source,
    privacyClass: "action_log",
    createdAt,
    payload,
  };
  return {
    ...run,
    events: [event, ...run.events],
  };
}

function mapLocalStatus(status: LocalAgentRunStatus): RunStatus {
  if (status === "accepted" || status === "thinking") return "pending";
  if (status === "running") return "running";
  if (status === "waiting_for_approval") return "paused";
  if (status === "paused") return "paused_by_user";
  if (status === "failed") return "failed";
  if (status === "stopped") return "stopped";
  return "completed";
}

function titleFromPrompt(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Local agent task";
  return trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed;
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, "i").test(text);
}

function limitRuns(store: LocalAgentStore): LocalAgentStore {
  return {
    ...store,
    runs: store.runs.slice(0, MAX_RUNS),
  };
}

function readOnboardingRecord(): BasichomeOnboardingRecord | undefined {
  if (typeof window === "undefined") return undefined;

  const stored = window.localStorage.getItem(BASICHOME_ONBOARDING_STORAGE_KEY);
  if (!stored) return undefined;

  try {
    return JSON.parse(stored) as BasichomeOnboardingRecord;
  } catch {
    return undefined;
  }
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
