import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReplayTrace,
  buildTrainingExportPreview,
  collectPlatformEvents,
  createInitialPlatformEventStore,
  filterPlatformEvents,
  labelPlatformEvent,
  setTrainingConsentMode,
  validatePlatformEvent,
} from "@/lib/platform-events-runtime";
import type { PlatformEvent } from "@/types/platform-events";

test("collects a valid unified envelope across local, cloud, app, approval, and context sources", () => {
  const events = collectPlatformEvents(createInitialPlatformEventStore());
  assert.ok(events.length > 20);

  const sources = new Set(events.map((event) => event.source));
  assert.ok(sources.has("client"));
  assert.ok(sources.has("cloud"));
  assert.ok(sources.has("app"));
  assert.ok(sources.has("approval"));
  assert.ok(sources.has("lens") || sources.has("agent"));

  const validations = events.map(validatePlatformEvent);
  assert.equal(validations.filter((result) => !result.ok).length, 0);
  assert.ok(events.every((event) => event.workspace_id && event.actor_account_id && event.created_at));
});

test("privacy validation fails closed for raw local payload leakage", () => {
  const event: PlatformEvent = {
    id: "pev_bad_raw",
    workspace_id: "workspace_local",
    actor_account_id: "local-dev-owner",
    device_id: "device_local_dev",
    source: "cloud",
    actor_type: "system",
    event_type: "lens.raw.leaked",
    privacy_class: "raw_local",
    redaction_state: "raw",
    target: "cloud",
    status: "completed",
    created_at: new Date().toISOString(),
    payload_inline: { ocr: "raw secret" },
    labels: ["test"],
  };

  const validation = validatePlatformEvent(event);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("raw_local")));
  assert.ok(validation.errors.some((error) => error.includes("cannot inline")));
});

test("feedback labels attach to events and make replay traces useful for evals", () => {
  const baseStore = createInitialPlatformEventStore();
  const events = collectPlatformEvents(baseStore);
  const failed = events.find((event) => event.id === "pev_app_log_inventory_check_failed") ?? events.find((event) => event.status === "failed" || event.status === "blocked") ?? events[0]!;
  const nextStore = labelPlatformEvent(baseStore, failed.id, "bad_action", "Regression seed");
  const relabeled = collectPlatformEvents(nextStore).find((event) => event.id === failed.id)!;

  assert.equal(relabeled.feedback?.label, "bad_action");
  const trace = buildReplayTrace(relabeled, collectPlatformEvents(nextStore), nextStore);
  assert.ok(trace.events.length >= 1);
  assert.ok(trace.failure_labels.includes("bad_action"));
});

test("training export defaults to no upload and excludes raw capture even after opt-in mode changes", () => {
  const disabledStore = createInitialPlatformEventStore();
  const events = collectPlatformEvents(disabledStore);
  const disabledPreview = buildTrainingExportPreview(events, disabledStore);

  assert.equal(disabledPreview.mode, "disabled");
  assert.equal(disabledPreview.upload_enabled, false);
  assert.equal(disabledPreview.raw_capture_included, false);
  assert.equal(disabledPreview.included_event_ids.length, 0);

  const evalStore = setTrainingConsentMode(disabledStore, "evals_only");
  const evalPreview = buildTrainingExportPreview(events, evalStore);
  assert.equal(evalPreview.mode, "evals_only");
  assert.equal(evalPreview.upload_enabled, false);
  assert.equal(evalPreview.raw_capture_included, false);
  assert.equal(evalPreview.included_event_ids.length, 0);
  assert.ok(!evalPreview.privacy_classes.includes("raw_local"));
});

test("filters isolate app, automation, approval, and device views", () => {
  const events = collectPlatformEvents(createInitialPlatformEventStore());

  assert.ok(filterPlatformEvents(events, { objectType: "app" }).every((event) => event.app_id));
  assert.ok(filterPlatformEvents(events, { objectType: "automation" }).every((event) => event.automation_id));
  assert.ok(filterPlatformEvents(events, { objectType: "approval" }).every((event) => event.approval_id));

  const deviceId = events.find((event) => event.device_id)?.device_id;
  assert.ok(deviceId);
  assert.ok(filterPlatformEvents(events, { deviceId }).every((event) => event.device_id === deviceId));
});
