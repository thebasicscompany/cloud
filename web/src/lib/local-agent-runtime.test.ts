import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createInitialLocalAgentStore,
  listLocalAgentLogs,
  localAgentRunToRun,
  localAgentRunToSteps,
  pauseLocalAgentRun,
  promoteLocalAgentRunToCloud,
  requiredLogFieldsPresent,
  resumeLocalAgentRun,
  startLocalAgentRun,
  stopLocalAgentRun,
  takeOverLocalBrowserRun,
  watchLocalBrowserRun,
} from "@/lib/local-agent-runtime";

test("starts a local-first run with required log fields", () => {
  const store = startLocalAgentRun(createInitialLocalAgentStore(), "Use approved context to plan my next invoice follow-up.", "auto");
  const run = store.runs[0];
  assert.ok(run);
  assert.equal(store.activeRunId, run.runId);
  assert.equal(run.status, "running");
  assert.equal(run.overlayStatus, "running");
  assert.equal(run.resolution.selectedTarget, "local_device");
  assert.equal(run.resolution.runtime, "basics_local_runner");
  assert.equal(run.toolCalls.some((tool) => tool.name === "context.query_approved"), true);
  assert.equal(listLocalAgentLogs(store).every(requiredLogFieldsPresent), true);
});

test("routes browser, Codex app, and cloud targets through the runtime router", () => {
  const browserStore = startLocalAgentRun(createInitialLocalAgentStore(), "Open the browser and inspect this page.", "auto");
  const appStore = startLocalAgentRun(createInitialLocalAgentStore(), "Build an internal app for invoice review.", "auto");
  const cloudStore = startLocalAgentRun(createInitialLocalAgentStore(), "Run this overnight in the background.", "auto");

  assert.equal(browserStore.runs[0]?.resolution.selectedTarget, "local_browser");
  assert.equal(browserStore.runs[0]?.resolution.runtime, "basics_local_browser");
  assert.equal(browserStore.runs[0]?.resolution.browserRuntimeTarget, "local_managed_browser");
  assert.equal(browserStore.runs[0]?.browser?.runtimeTarget, "local_managed_browser");
  assert.equal(appStore.runs[0]?.resolution.selectedTarget, "codex_app_server");
  assert.equal(appStore.runs[0]?.resolution.runtime, "codex_app_server");
  assert.equal(appStore.runs[0]?.resolution.authMode, "local_codex_account");
  assert.equal(appStore.runs[0]?.events.some((event) => event.type === "policy.gate.evaluated"), true);
  assert.equal(cloudStore.runs[0]?.resolution.selectedTarget, "basics_cloud");
  assert.equal(cloudStore.runs[0]?.resolution.runtime, "basics_cloud_worker");
  assert.equal(cloudStore.runs[0]?.resolution.approvalPolicy, "cloud_promotion_required");
});

test("browser runtime keeps managed, active, login, and cloud browser modes explicit", () => {
  const managed = startLocalAgentRun(createInitialLocalAgentStore(), "Open Hacker News and read the top story.", "local_browser", undefined, {
    browserRuntimeTarget: "local_managed_browser",
    browserDomain: "news.ycombinator.com",
  });
  const managedRun = managed.runs[0];
  assert.ok(managedRun?.browser);
  assert.equal(managedRun.browser.runtimeTarget, "local_managed_browser");
  assert.equal(managedRun.resolution.authMode, "local_browser_profile");
  assert.equal(managedRun.events.some((event) => event.type === "browser.page.loaded"), true);

  const active = startLocalAgentRun(createInitialLocalAgentStore(), "Help with the page I selected.", "local_browser", undefined, {
    browserRuntimeTarget: "local_visible_browser",
    browserDomain: "app.hubspot.com",
    userSelectedActiveBrowser: true,
  });
  assert.equal(active.runs[0]?.browser?.runtimeTarget, "local_visible_browser");
  assert.equal(active.runs[0]?.resolution.authMode, "active_browser_user_account");

  const login = startLocalAgentRun(createInitialLocalAgentStore(), "Sign in to JobBoard Pro.", "local_browser", undefined, {
    browserRuntimeTarget: "local_managed_browser",
    browserDomain: "jobboardpro.example",
    requiresLogin: true,
  });
  assert.equal(login.runs[0]?.browser?.status, "needs_login");
  assert.equal(login.runs[0]?.events.some((event) => event.type === "browser.login.required"), true);

  const cloud = startLocalAgentRun(createInitialLocalAgentStore(), "Run this browser check overnight.", "basics_cloud", undefined, {
    browserRuntimeTarget: "basics_cloud_browser",
    browserDomain: "app.qbo.intuit.com",
  });
  assert.equal(cloud.runs[0]?.resolution.selectedTarget, "basics_cloud");
  assert.equal(cloud.runs[0]?.resolution.browserRuntimeTarget, "basics_cloud_browser");
  assert.equal(cloud.runs[0]?.browser?.liveViewUrl?.startsWith("https://cloud.trybasics.ai/live/"), true);
});

test("browser watch, take-over, stop, and cloud promotion append logs", () => {
  const initial = startLocalAgentRun(createInitialLocalAgentStore(), "Open Hacker News in the browser.", "local_browser", undefined, {
    browserRuntimeTarget: "local_managed_browser",
    browserDomain: "news.ycombinator.com",
  });
  const runId = initial.runs[0]?.runId;
  assert.ok(runId);

  const watched = watchLocalBrowserRun(initial, runId);
  assert.equal(watched.runs[0]?.browser?.viewMode, "watching");
  assert.equal(watched.runs[0]?.events[0]?.type, "browser.live_view.opened");

  const takeover = takeOverLocalBrowserRun(watched, runId);
  assert.equal(takeover.runs[0]?.status, "paused");
  assert.equal(takeover.runs[0]?.browser?.viewMode, "user_takeover");
  assert.equal(takeover.runs[0]?.events[0]?.type, "browser.takeover.enabled");

  const promoted = promoteLocalAgentRunToCloud(takeover, runId);
  assert.equal(promoted.runs[0]?.resolution.browserRuntimeTarget, "basics_cloud_browser");
  assert.equal(promoted.runs[0]?.browser?.cloudPromotionStatus, "approval_required");
  assert.equal(promoted.runs[0]?.events[0]?.type, "browser.cloud.promotion_queued");
});

test("explicit Codex exec runs stay inside Basics policy and logs", () => {
  const store = startLocalAgentRun(createInitialLocalAgentStore(), "Build a tiny app card for invoice follow-up.", "codex_exec");
  const run = store.runs[0];
  assert.ok(run);
  assert.equal(run.resolution.provider, "codex");
  assert.equal(run.resolution.runtime, "codex_exec");
  assert.equal(run.resolution.authMode, "local_codex_account");
  assert.equal(run.resolution.costBearer, "user_codex_subscription");
  assert.equal(run.toolCalls.some((tool) => tool.name === "codex.exec_json"), true);
  assert.equal(run.events.some((event) => event.type === "codex.thread.started"), true);
  assert.equal(run.events.some((event) => event.type === "tool_call.started" && event.source === "codex"), true);
  assert.equal(listLocalAgentLogs(store).every(requiredLogFieldsPresent), true);
});

test("pause, resume, stop, and promote mutate state and append audit events", () => {
  const initial = startLocalAgentRun(createInitialLocalAgentStore(), "Use approved context to draft a local plan.", "local_device");
  const runId = initial.runs[0]?.runId;
  assert.ok(runId);

  const paused = pauseLocalAgentRun(initial, runId);
  assert.equal(paused.runs[0]?.status, "paused");
  assert.equal(paused.runs[0]?.events[0]?.type, "run.paused");

  const resumed = resumeLocalAgentRun(paused, runId);
  assert.equal(resumed.runs[0]?.status, "running");
  assert.equal(resumed.runs[0]?.events[0]?.type, "run.resumed");

  const promoted = promoteLocalAgentRunToCloud(resumed, runId);
  assert.equal(promoted.runs[0]?.status, "waiting_for_approval");
  assert.equal(promoted.runs[0]?.resolution.selectedTarget, "basics_cloud");
  assert.equal(promoted.runs[0]?.events[0]?.type, "run.promoted_to_cloud");

  const stopped = stopLocalAgentRun(promoted, runId);
  assert.equal(stopped.runs[0]?.status, "stopped");
  assert.equal(stopped.runs[0]?.overlayStatus, "complete");
  assert.equal(stopped.runs[0]?.events[0]?.type, "run.stopped");
  assert.match(stopped.runs[0]?.events[0]?.toolCallId ?? "", /^tool_/);
});

test("run detail adapters expose local runs and timeline steps", () => {
  const store = startLocalAgentRun(createInitialLocalAgentStore(), "Inspect my screen and summarize the safe next step.", "local_device");
  const localRun = store.runs[0];
  assert.ok(localRun);

  const run = localAgentRunToRun(localRun);
  const steps = localAgentRunToSteps(localRun);

  assert.equal(run.id, localRun.runId);
  assert.equal(run.runtime, "basics_local_runner");
  assert.equal(run.executionTarget, "local_device");
  assert.equal(run.actorAccountId, localRun.actorAccountId);
  assert.equal(run.deviceId, localRun.deviceId);
  assert.equal(steps.some((step) => step.kind === "tool_call"), true);
  assert.equal(steps.length, localRun.events.length);
});
