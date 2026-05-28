import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cloudAutomationRunChecks,
  cloudAutomationRunToRun,
  cloudAutomationRunToSteps,
  createInitialCloudAutomationStore,
  findCloudAutomation,
  findCloudAutomationRun,
  grantCloudAutomationTrust,
  listCloudAutomationLogs,
  listCloudAutomationSummaries,
  promoteLocalRunToCloudAutomation,
  replayCloudAutomationRun,
  revokeCloudAutomationTrust,
  runCloudAutomationNow,
  updateCloudAutomationSchedule,
} from "@/lib/cloud-automation-runtime";
import { createInitialLocalAgentStore, startLocalAgentRun } from "@/lib/local-agent-runtime";

test("seeds cloud automations with schedule, trust grant, logs, and replay", () => {
  const store = createInitialCloudAutomationStore();
  const summaries = listCloudAutomationSummaries(store);
  const eod = summaries.find((automation) => automation.id === "auto_eod_invoice_review");

  assert.ok(eod);
  assert.equal(eod.status, "active");
  assert.equal(eod.approvalPolicy.mode, "trusted_autonomous");
  assert.equal(eod.activeTrustGrantCount, 1);
  assert.ok(eod.triggers.some((trigger) => trigger.type === "schedule" && trigger.status === "registered"));
  assert.ok(store.runs.some((run) => run.id === "run_cloud_eod_seed_success"));
  assert.ok(listCloudAutomationLogs(store).every((event) => event.runId && event.actorAccountId && event.deviceId && event.createdAt));
});

test("promotes a local browser run to a scheduled cloud automation", () => {
  const localStore = startLocalAgentRun(createInitialLocalAgentStore(), "Open JobBoard Pro and chase completed work overnight.", "local_browser", undefined, {
    browserRuntimeTarget: "local_managed_browser",
    browserDomain: "jobboardpro.example",
  });
  const localRun = localStore.runs[0];
  assert.ok(localRun);

  const promoted = promoteLocalRunToCloudAutomation(createInitialCloudAutomationStore(), localRun);
  const automationId = promoted.lastPromotedAutomationId;
  assert.ok(automationId);
  const automation = findCloudAutomation(promoted, automationId);

  assert.ok(automation);
  assert.equal(automation.source, "local_promotion");
  assert.equal(automation.localSourceRunId, localRun.runId);
  assert.equal(automation.status, "active");
  assert.equal(automation.approvalPolicy.mode, "risk_based");
  assert.ok(automation.triggers.some((trigger) => trigger.type === "schedule" && trigger.eventBridgeName.startsWith("automation-")));
  assert.ok(automation.requiredCredentials.includes("jobboardpro"));
});

test("trust grant allows a promoted automation to run fully autonomously with adapters", () => {
  const localStore = startLocalAgentRun(createInitialLocalAgentStore(), "Open JobBoard Pro and chase completed work overnight.", "local_browser", undefined, {
    browserRuntimeTarget: "local_managed_browser",
    browserDomain: "jobboardpro.example",
  });
  const localRun = localStore.runs[0];
  assert.ok(localRun);

  const promoted = promoteLocalRunToCloudAutomation(createInitialCloudAutomationStore(), localRun);
  const automationId = promoted.lastPromotedAutomationId;
  assert.ok(automationId);

  const trusted = grantCloudAutomationTrust(promoted, automationId);
  const ran = runCloudAutomationNow(trusted, automationId, "scheduled");
  const cloudRun = ran.runs[0];
  assert.ok(cloudRun);

  assert.equal(cloudRun.status, "completed");
  assert.equal(cloudRun.trigger, "scheduled");
  assert.equal(cloudRun.events.some((event) => event.type === "approval_auto_approved"), true);
  assert.equal(cloudRun.events.some((event) => event.type === "run_completed"), true);
  assert.ok(cloudRun.outputs.length > 0);

  const run = cloudAutomationRunToRun(cloudRun);
  const steps = cloudAutomationRunToSteps(cloudRun);
  const checks = cloudAutomationRunChecks(cloudRun);
  assert.equal(run.executionTarget, "basics_cloud");
  assert.equal(run.runtime, "basics_cloud_worker");
  assert.equal(run.status, "verified");
  assert.equal(run.browserRuntimeTarget, "basics_cloud_browser");
  assert.equal(steps.some((step) => step.kind === "approval"), true);
  assert.equal(checks.every((check) => check.passed), true);
});

test("revoked trust forces the next cloud run to pause for approval", () => {
  const store = createInitialCloudAutomationStore();
  const revoked = revokeCloudAutomationTrust(store, "auto_eod_invoice_review");
  const ran = runCloudAutomationNow(revoked, "auto_eod_invoice_review");
  const cloudRun = ran.runs[0];

  assert.ok(cloudRun);
  assert.equal(cloudRun.status, "awaiting_approval");
  assert.equal(cloudRun.events.some((event) => event.type === "approval_requested"), true);
  assert.equal(cloudAutomationRunToRun(cloudRun).status, "paused");
});

test("schedule updates and failure replay are persisted as cloud logs", () => {
  const store = createInitialCloudAutomationStore();
  const scheduled = updateCloudAutomationSchedule(store, "auto_eod_invoice_review", "*/15 * * * *", "America/Los_Angeles");
  const automation = findCloudAutomation(scheduled, "auto_eod_invoice_review");
  assert.ok(automation);
  assert.equal(automation.triggers.some((trigger) => trigger.type === "schedule" && trigger.cron === "*/15 * * * *"), true);

  const replayed = replayCloudAutomationRun(scheduled, "run_cloud_lead_seed_failed");
  const activeRunId = replayed.activeRunId;
  assert.ok(activeRunId);
  const replayRun = findCloudAutomationRun(replayed, activeRunId);
  assert.ok(replayRun);
  assert.equal(replayRun.runMode, "replay");
  assert.equal(replayRun.status, "completed");
  assert.equal(replayRun.events.some((event) => event.type === "replay_started"), true);
  assert.equal(listCloudAutomationLogs(replayed).some((event) => event.type === "automation.schedule_updated"), true);
});
