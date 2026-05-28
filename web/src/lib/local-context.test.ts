import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approveSummary,
  enforceLocalRetention,
  queryApprovedLocalContextForAgent,
  setCaptureStatus,
  summarizePrivacyBoundary,
} from "@/lib/local-context";
import { createInitialLocalContextStore } from "@/mocks/local-context";
import type { BasichomeOnboardingRecord } from "@/lib/onboarding";
import type { CaptureDataKind } from "@/types/local-context";

test("seeds local-only Lens context from onboarding state", () => {
  const onboarding: BasichomeOnboardingRecord = {
    schemaVersion: 1,
    completedAt: "2026-05-28T00:00:00.000Z",
    workspace: {
      id: "workspace_northlight",
      name: "Northlight",
      role: "owner",
      adminApprovalRequired: true,
    },
    device: {
      id: "device_pm_laptop",
      name: "PM Laptop",
      localProfileId: "local_profile_pm",
    },
    permissions: {
      screen_recording: "granted",
      accessibility: "granted",
      input_control: "skipped",
      audio: "skipped",
      browser_profile: "granted",
    },
    capture: {
      enabled: true,
      status: "paused",
      retentionDays: 7,
      storageLocation: "~/Library/Application Support/basichome/Lens-Test",
      rawCloudUpload: false,
      distilledCloudRequiresApproval: true,
    },
    engine: {
      mode: "codex_local",
      apiKeyRequired: false,
    },
    policy: {
      appInstallApproval: true,
      firstAutomationRunApproval: true,
      cloudDeployApproval: true,
      trainingEnabled: false,
      dailyCloudBudgetUsd: 10,
    },
  };

  const store = createInitialLocalContextStore(onboarding);
  assert.equal(store.status.deviceId, "device_pm_laptop");
  assert.equal(store.status.localProfileId, "local_profile_pm");
  assert.equal(store.status.storageRoot, "~/Library/Application Support/basichome/Lens-Test");
  assert.equal(store.status.retentionDays, 7);
  assert.equal(store.status.rawUploadEnabled, false);
  assert.equal(store.status.permissions.input_control, "skipped");
});

test("keeps raw capture pointers local and exposes the expected data contract", () => {
  const store = createInitialLocalContextStore();
  const kinds = new Set(store.rawPointers.map((pointer) => pointer.kind));
  const expectedKinds: CaptureDataKind[] = ["accessibility_tree", "app_window", "audio_transcript", "input_timeline", "ocr", "screenshot"];

  assert.equal(store.status.localApi.baseUrl, "http://127.0.0.1:3030/v1");
  assert.equal(store.status.localApi.exposesRawData, false);
  assert.equal(store.status.eventDrivenCapture, true);
  assert.equal(store.rawPointers.every((pointer) => pointer.privacyClass === "raw_local"), true);
  assert.equal(store.rawPointers.every((pointer) => pointer.uploadState === "local_only"), true);
  assert.equal(expectedKinds.every((kind) => kinds.has(kind)), true);
});

test("agent queries return approved distilled summaries without raw references", () => {
  const store = createInitialLocalContextStore();
  const result = queryApprovedLocalContextForAgent(store, "invoice automations");

  assert.equal(result.privacyClass, "distilled_cloud");
  assert.equal(result.rawItemsReturned, 0);
  assert.equal(result.summaries.length, 2);
  assert.equal(result.summaries.every((summary) => summary.approvalStatus === "approved"), true);
  assert.equal(result.summaries.some((summary) => summary.id === "ctx_sum_browser_login"), false);
  assert.equal(result.summaries.some((summary) => Object.hasOwn(summary, "rawRefs")), false);
  assert.equal(result.summaries.some((summary) => Object.hasOwn(summary, "localPath")), false);
});

test("retention enforcement removes expired raw data and denied summaries", () => {
  const store = createInitialLocalContextStore();
  const result = enforceLocalRetention(store);

  assert.equal(result.deletedCount, 2);
  assert.equal(result.store.rawPointers.some((pointer) => pointer.id === "raw_old_01"), false);
  assert.equal(result.store.summaries.some((summary) => summary.id === "ctx_sum_old_contract"), false);
  assert.equal(result.store.auditEvents[0]?.eventType, "lens.retention.swept");
});

test("pause, resume, approval, and privacy summaries preserve the local boundary", () => {
  const paused = setCaptureStatus(createInitialLocalContextStore(), "paused");
  const resumed = setCaptureStatus(paused, "running");
  const approved = approveSummary(resumed, "ctx_sum_browser_login");
  const privacy = summarizePrivacyBoundary(approved);

  assert.equal(paused.status.status, "paused");
  assert.equal(paused.auditEvents[0]?.eventType, "lens.capture.paused");
  assert.equal(resumed.status.status, "running");
  assert.equal(resumed.auditEvents[0]?.eventType, "lens.capture.running");
  assert.equal(approved.summaries.find((summary) => summary.id === "ctx_sum_browser_login")?.approval.status, "approved");
  assert.equal(approved.summaries.find((summary) => summary.id === "ctx_sum_browser_login")?.uploadState, "approved_for_cloud");
  assert.equal(privacy.rawUploadEnabled, false);
  assert.equal(privacy.rawPointersLocalOnly, true);
  assert.equal(privacy.agentQueryReturnsRaw, false);
});
