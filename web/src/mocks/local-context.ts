import type { BasichomeOnboardingRecord } from "@/lib/onboarding";
import type {
  CapturePermissionMap,
  ContextAuditEvent,
  DistilledContextSummary,
  LocalContextStatus,
  LocalContextStore,
  RawContextPointer,
} from "@/types/local-context";

const NOW = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_PERMISSIONS: CapturePermissionMap = {
  screen_recording: "granted",
  accessibility: "granted",
  input_control: "granted",
  audio: "skipped",
  browser_profile: "granted",
};

export function createInitialLocalContextStore(onboarding?: BasichomeOnboardingRecord): LocalContextStore {
  const deviceId = onboarding?.device.id ?? "device_local_dev";
  const localProfileId = onboarding?.device.localProfileId ?? "local-dev-owner";
  const workspaceId = onboarding?.workspace.id ?? "workspace_local";
  const storageRoot = onboarding?.capture.storageLocation ?? "~/Library/Application Support/basichome/Lens";
  const retentionDays = onboarding?.capture.retentionDays ?? 30;
  const permissions = {
    ...DEFAULT_PERMISSIONS,
    ...(onboarding?.permissions as Partial<CapturePermissionMap> | undefined),
  };

  const status: LocalContextStatus = {
    service: "lens_local",
    status: onboarding?.capture.status ?? "running",
    workspaceId,
    deviceId,
    localProfileId,
    storageRoot,
    retentionDays,
    rawUploadEnabled: false,
    encryptedAtRest: true,
    eventDrivenCapture: true,
    permissions,
    lastCaptureAt: relMinutes(-1),
    nextRetentionSweepAt: relMinutes(55),
    captureTriggers: ["app_switch", "window_focus", "click", "typing_pause", "scroll_stop", "clipboard_copy", "idle_fallback"],
    localApi: {
      baseUrl: "http://127.0.0.1:3030/v1",
      auth: "loopback_bearer",
      exposesRawData: false,
    },
  };

  return {
    schemaVersion: 1,
    status,
    rawPointers: createRawPointers(storageRoot),
    summaries: createSummaries(deviceId, localProfileId),
    auditEvents: createAuditEvents(deviceId),
  };
}

function createRawPointers(storageRoot: string): RawContextPointer[] {
  return [
    raw("raw_frame_01", "screenshot", -4, 30, "Chrome", "Northlight invoices", `${storageRoot}/frames/2026-05-28/1716909000_m0.jpg`, 84231, "metadata"),
    raw("raw_a11y_01", "accessibility_tree", -4, 30, "Chrome", "Northlight invoices", `${storageRoot}/sqlite/frames.db#frame_01`, 12370, "accessibility"),
    raw("raw_input_01", "input_timeline", -3, 30, "Chrome", "Northlight invoices", `${storageRoot}/sqlite/input.db#evt_44`, 1744, "input"),
    raw("raw_window_01", "app_window", -2, 30, "Mail", "Draft reminder", `${storageRoot}/sqlite/windows.db#focus_91`, 888, "metadata"),
    raw("raw_audio_01", "audio_transcript", -48, 30, "Zoom", "Pipeline review", `${storageRoot}/audio/2026-05-26/meeting_01.json`, 42812, "audio"),
    raw("raw_old_01", "ocr", -46 * 24 * 60, 30, "Preview", "Old contract.pdf", `${storageRoot}/sqlite/frames.db#old_01`, 2200, "ocr"),
  ];
}

function createSummaries(deviceId: string, localProfileId: string): DistilledContextSummary[] {
  return [
    {
      id: "ctx_sum_invoice_chase",
      privacyClass: "distilled_cloud",
      title: "Invoice follow-up pattern",
      summary: "User checks open invoices, drafts a polite reminder, then waits for approval before sending to first-time recipients.",
      timeRange: { start: relMinutes(-18), end: relMinutes(-3) },
      deviceId,
      localProfileId,
      sourceApps: ["Chrome", "Mail"],
      sourceWindows: ["Northlight invoices", "Draft reminder"],
      rawRefs: ["raw_frame_01", "raw_a11y_01", "raw_input_01", "raw_window_01"],
      memorySignals: ["invoice_id_present", "recipient_first_time", "approval_required"],
      automationCandidate: "Suggest saved automation: chase overdue invoices with approval before sending.",
      approval: {
        status: "approved",
        approvedBy: "local-dev-owner",
        approvedAt: relMinutes(-2),
        policyId: "policy_context_distill_v1",
      },
      uploadState: "approved_for_cloud",
    },
    {
      id: "ctx_sum_pipeline_review",
      privacyClass: "distilled_cloud",
      title: "Pipeline review meeting",
      summary: "User reviewed sales pipeline risks and marked churn above target as requiring human review before Slack posting.",
      timeRange: { start: relMinutes(-90), end: relMinutes(-48) },
      deviceId,
      localProfileId,
      sourceApps: ["Zoom", "Slack"],
      sourceWindows: ["Pipeline review", "#leadership"],
      rawRefs: ["raw_audio_01"],
      memorySignals: ["churn_threshold", "leadership_digest", "approval_required"],
      automationCandidate: "Suggest check: pause revenue digest when churn exceeds configured threshold.",
      approval: {
        status: "approved",
        approvedBy: "local-dev-owner",
        approvedAt: relMinutes(-42),
        policyId: "policy_context_distill_v1",
      },
      uploadState: "approved_for_cloud",
    },
    {
      id: "ctx_sum_browser_login",
      privacyClass: "distilled_cloud",
      title: "Browser login recovery",
      summary: "User re-authenticated a managed local browser profile for tasks that should not use the active personal browser by default.",
      timeRange: { start: relMinutes(-33), end: relMinutes(-22) },
      deviceId,
      localProfileId,
      sourceApps: ["Chrome"],
      sourceWindows: ["Login prompt"],
      rawRefs: ["raw_frame_01"],
      memorySignals: ["managed_browser", "cookie_store", "explicit_login"],
      approval: {
        status: "pending",
        policyId: "policy_context_distill_v1",
      },
      uploadState: "not_uploaded",
    },
    {
      id: "ctx_sum_old_contract",
      privacyClass: "distilled_cloud",
      title: "Old contract review",
      summary: "Older OCR summary is outside the current retention window and should not be returned to agents.",
      timeRange: { start: relMinutes(-46 * 24 * 60), end: relMinutes(-46 * 24 * 60 + 10) },
      deviceId,
      localProfileId,
      sourceApps: ["Preview"],
      sourceWindows: ["Old contract.pdf"],
      rawRefs: ["raw_old_01"],
      memorySignals: ["expired_retention"],
      approval: {
        status: "denied",
        policyId: "policy_context_distill_v1",
      },
      uploadState: "denied",
    },
  ];
}

function createAuditEvents(deviceId: string): ContextAuditEvent[] {
  return [
    audit("evt_lens_started", "lens.capture.started", "lens", deviceId, "raw_local", -6),
    audit("evt_summary_invoice", "lens.summary.approved", "client", deviceId, "distilled_cloud", -2, "ctx_sum_invoice_chase"),
    audit("evt_query_agent", "agent.context_query.local_distilled", "agent", deviceId, "distilled_cloud", -1, "ctx_sum_invoice_chase"),
  ];
}

function raw(
  id: string,
  kind: RawContextPointer["kind"],
  capturedDeltaMinutes: number,
  retentionDays: number,
  sourceApp: string,
  windowTitle: string,
  localPath: string,
  byteSize: number,
  textSource: RawContextPointer["textSource"],
): RawContextPointer {
  const capturedAtMs = NOW + capturedDeltaMinutes * 60_000;
  return {
    id,
    kind,
    privacyClass: "raw_local",
    capturedAt: new Date(capturedAtMs).toISOString(),
    retainedUntil: new Date(capturedAtMs + retentionDays * DAY_MS).toISOString(),
    sourceApp,
    windowTitle,
    localPath,
    byteSize,
    textSource,
    redactionState: "raw",
    uploadState: "local_only",
  };
}

function audit(
  id: string,
  eventType: string,
  source: ContextAuditEvent["source"],
  deviceId: string,
  privacyClass: ContextAuditEvent["privacyClass"],
  deltaMinutes: number,
  payloadRef?: string,
): ContextAuditEvent {
  return {
    id,
    eventType,
    source,
    actorAccountId: source === "agent" ? "agent_local" : "local-dev-owner",
    deviceId,
    privacyClass,
    redactionState: privacyClass === "raw_local" ? "raw" : "summarized",
    payloadRef,
    createdAt: relMinutes(deltaMinutes),
  };
}

function relMinutes(deltaMinutes: number): string {
  return new Date(NOW + deltaMinutes * 60_000).toISOString();
}
