import { findApproval, readApprovalStore } from "@/lib/admin-approvals-runtime";
import { readCloudAutomationStore } from "@/lib/cloud-automation-runtime";
import { readLocalAgentStore } from "@/lib/local-agent-runtime";
import { readLocalContextStore } from "@/lib/local-context";
import { readWorkspaceAppsStore } from "@/lib/workspace-apps-runtime";
import type { WorkspaceApprovalLogEvent } from "@/types/approvals";
import type { WorkspaceAppLogEvent } from "@/types/apps";
import type { CloudAutomationRun, CloudRunEvent } from "@/types/cloud-automation";
import type { ContextAuditEvent } from "@/types/local-context";
import type { LocalAgentLogEvent, LocalAgentRun } from "@/types/local-agent";
import type {
  PlatformActorType,
  PlatformEvent,
  PlatformEventCost,
  PlatformEventFeedback,
  PlatformEventFilters,
  PlatformEventSource,
  PlatformEventStatus,
  PlatformEventStore,
  PlatformEventValidation,
  PlatformExecutionTarget,
  PlatformFeedbackLabel,
  PlatformPrivacyClass,
  PlatformReplayTrace,
  TrainingConsentMode,
  TrainingExportPreview,
} from "@/types/platform-events";

export const BASICHOME_PLATFORM_EVENTS_STORAGE_KEY = "basichome:platform-events:v1";

const DEFAULT_WORKSPACE_ID = "workspace_local";
const DEFAULT_ACTOR_ACCOUNT_ID = "local-dev-owner";
const DEFAULT_DEVICE_ID = "device_local_dev";

const PRIVACY_CLASSES: PlatformPrivacyClass[] = [
  "raw_local",
  "distilled_cloud",
  "action_log",
  "training_allowed",
  "training_denied",
];

const TRAINING_EXPORT_CLASSES: PlatformPrivacyClass[] = [
  "action_log",
  "distilled_cloud",
  "training_allowed",
];

export function readPlatformEventStore(): PlatformEventStore {
  if (typeof window === "undefined") return createInitialPlatformEventStore();

  const stored = window.localStorage.getItem(BASICHOME_PLATFORM_EVENTS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<PlatformEventStore>;
      if (parsed.schemaVersion === 1 && parsed.trainingConsent && parsed.feedback) {
        return {
          schemaVersion: 1,
          trainingConsent: {
            mode: parsed.trainingConsent.mode ?? "disabled",
            uploadEnabled: Boolean(parsed.trainingConsent.uploadEnabled),
            rawCaptureAllowed: false,
            consentPolicyId: parsed.trainingConsent.consentPolicyId ?? "policy_training_disabled_v1",
          },
          feedback: parsed.feedback,
        };
      }
    } catch {
      window.localStorage.removeItem(BASICHOME_PLATFORM_EVENTS_STORAGE_KEY);
    }
  }

  const seeded = createInitialPlatformEventStore();
  writePlatformEventStore(seeded);
  return seeded;
}

export function writePlatformEventStore(store: PlatformEventStore): PlatformEventStore {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASICHOME_PLATFORM_EVENTS_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function createInitialPlatformEventStore(): PlatformEventStore {
  return {
    schemaVersion: 1,
    trainingConsent: {
      mode: "disabled",
      uploadEnabled: false,
      rawCaptureAllowed: false,
      consentPolicyId: "policy_training_disabled_v1",
    },
    feedback: {},
  };
}

export function collectPlatformEvents(store = readPlatformEventStore()): PlatformEvent[] {
  const localStore = readLocalAgentStore();
  const cloudStore = readCloudAutomationStore();
  const appStore = readWorkspaceAppsStore();
  const approvalStore = readApprovalStore();
  const contextStore = readLocalContextStore();

  const cloudRunsById = new Map(cloudStore.runs.map((run) => [run.id, run]));
  const approvalById = new Map(approvalStore.approvals.map((approval) => [approval.id, approval]));
  const localRunsById = new Map(localStore.runs.map((run) => [run.runId, run]));

  const events = [
    ...localStore.runs.flatMap((run) => run.events.map((event) => platformEventFromLocalLog(event, run))),
    ...cloudStore.logs.map((event) => platformEventFromCloudLog(event, cloudRunsById.get(event.runId))),
    ...appStore.logs.map(platformEventFromAppLog),
    ...approvalStore.logs.map((event) => platformEventFromApprovalLog(event, approvalById.get(event.approvalId))),
    ...contextStore.auditEvents.map(platformEventFromContextAudit),
  ];

  return events
    .map((event) => applyFeedback(event, store.feedback[event.id]))
    .map((event) => enrichEventFromRun(event, localRunsById.get(event.run_id ?? "")))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function labelPlatformEvent(
  store: PlatformEventStore,
  eventId: string,
  label: PlatformFeedbackLabel,
  note?: string,
): PlatformEventStore {
  return {
    ...store,
    feedback: {
      ...store.feedback,
      [eventId]: {
        label,
        actor_account_id: DEFAULT_ACTOR_ACCOUNT_ID,
        created_at: new Date().toISOString(),
        note,
      },
    },
  };
}

export function setTrainingConsentMode(store: PlatformEventStore, mode: TrainingConsentMode): PlatformEventStore {
  return {
    ...store,
    trainingConsent: {
      mode,
      uploadEnabled: false,
      rawCaptureAllowed: false,
      consentPolicyId: `policy_training_${mode}_v1`,
    },
  };
}

export function filterPlatformEvents(events: PlatformEvent[], filters: PlatformEventFilters = {}): PlatformEvent[] {
  const search = filters.search?.trim().toLowerCase();
  return events.filter((event) => {
    if (filters.source && filters.source !== "all" && event.source !== filters.source) return false;
    if (filters.privacyClass && filters.privacyClass !== "all" && event.privacy_class !== filters.privacyClass) return false;
    if (filters.deviceId && filters.deviceId !== "all" && event.device_id !== filters.deviceId) return false;
    if (filters.feedback === "unlabeled" && event.feedback) return false;
    if (filters.feedback && filters.feedback !== "all" && filters.feedback !== "unlabeled" && event.feedback?.label !== filters.feedback) return false;
    if (filters.objectType && filters.objectType !== "all" && !eventMatchesObjectType(event, filters.objectType)) return false;
    if (search && !eventSearchHaystack(event).includes(search)) return false;
    return true;
  });
}

export function validatePlatformEvent(event: PlatformEvent): PlatformEventValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const field of ["id", "workspace_id", "actor_account_id", "source", "event_type", "privacy_class", "redaction_state", "target", "status", "created_at"] as const) {
    if (!event[field]) errors.push(`${field} is required.`);
  }
  if (!PRIVACY_CLASSES.includes(event.privacy_class)) errors.push(`Unsupported privacy_class ${event.privacy_class}.`);
  if (Number.isNaN(new Date(event.created_at).getTime())) errors.push("created_at must be an ISO timestamp.");
  if (event.privacy_class === "raw_local") {
    if (event.target !== "local_device" && event.target !== "local") errors.push("raw_local events must stay on a local target.");
    if (event.source !== "lens" && event.source !== "client") errors.push("raw_local events can only originate from Lens/client local capture.");
    if (event.payload_inline) errors.push("raw_local events cannot inline payloads; use local payload_ref only.");
  }
  if (event.privacy_class === "training_allowed" && !event.consent_policy_id) {
    errors.push("training_allowed events require consent_policy_id.");
  }
  if (!event.run_id && !event.app_id && !event.automation_id && !event.approval_id && !event.payload_ref && !event.conversation_id) {
    warnings.push("event has no object pointer; drill-in may be limited.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function buildTrainingExportPreview(
  events: PlatformEvent[],
  store = readPlatformEventStore(),
): TrainingExportPreview {
  const mode = store.trainingConsent.mode;
  const blockedReasons = [
    "Training upload is disabled by default.",
    "Raw Lens capture is never included in v1 training exports.",
  ];
  const uploadEnabled = false;
  const eligible = mode === "disabled"
    ? []
    : events.filter((event) => TRAINING_EXPORT_CLASSES.includes(event.privacy_class) && event.privacy_class !== "raw_local");

  if (mode === "disabled") blockedReasons.unshift("Workspace training mode is disabled.");

  return {
    id: `training_export_preview_${mode}`,
    workspace_id: DEFAULT_WORKSPACE_ID,
    mode,
    upload_enabled: uploadEnabled,
    raw_capture_included: false,
    created_at: new Date().toISOString(),
    included_event_ids: uploadEnabled ? eligible.map((event) => event.id) : [],
    excluded_event_ids: events.filter((event) => !eligible.includes(event) || !uploadEnabled).map((event) => event.id),
    privacy_classes: Array.from(new Set(eligible.map((event) => event.privacy_class))),
    blocked_reasons: blockedReasons,
    event_count: uploadEnabled ? eligible.length : 0,
  };
}

export function buildReplayTrace(
  event: PlatformEvent,
  events: PlatformEvent[],
  store = readPlatformEventStore(),
): PlatformReplayTrace {
  const subject = event.run_id ?? event.automation_id ?? event.app_id ?? event.approval_id ?? event.device_id ?? event.id;
  const subjectType = event.run_id
    ? "run"
    : event.automation_id
      ? "automation"
      : event.app_id
        ? "app"
        : event.approval_id
          ? "approval"
          : "device";
  const related = events.filter((candidate) => {
    if (event.run_id && candidate.run_id === event.run_id) return true;
    if (event.automation_id && candidate.automation_id === event.automation_id) return true;
    if (event.app_id && candidate.app_id === event.app_id) return true;
    if (event.approval_id && candidate.approval_id === event.approval_id) return true;
    return Boolean(event.device_id && candidate.device_id === event.device_id);
  });

  return {
    id: `replay_${subject}`,
    subject_id: subject,
    subject_type: subjectType,
    events: related.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    failure_labels: related.map((candidate) => candidate.feedback?.label).filter(isFailureFeedback),
    replayable: related.some((candidate) => Boolean(candidate.replay) || candidate.status === "failed" || candidate.status === "completed"),
    training_export_preview: buildTrainingExportPreview(related, store),
  };
}

export function summarizePlatformEvents(events: PlatformEvent[], store = readPlatformEventStore()) {
  const validation = events.map(validatePlatformEvent);
  const exportPreview = buildTrainingExportPreview(events, store);
  return {
    total: events.length,
    invalid: validation.filter((result) => !result.ok).length,
    privacyClasses: countBy(events, (event) => event.privacy_class),
    sources: countBy(events, (event) => event.source),
    feedback: countBy(events.filter((event) => event.feedback), (event) => event.feedback!.label),
    replayReady: events.filter((event) => event.replay || event.run_id || event.automation_id).length,
    trainingExport: exportPreview,
  };
}

export function platformEventFromLocalLog(event: LocalAgentLogEvent, run?: LocalAgentRun): PlatformEvent {
  return baseEvent({
    id: `pev_local_${event.id}`,
    workspace_id: run?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    actor_account_id: event.actorAccountId,
    device_id: event.deviceId,
    run_id: event.runId,
    tool_call_id: event.toolCallId,
    source: mapSource(event.source),
    actor_type: event.source === "agent" || event.source === "codex" ? "agent" : "user",
    event_type: event.type,
    privacy_class: event.privacyClass,
    redaction_state: event.privacyClass === "distilled_cloud" ? "summarized" : "redacted",
    target: mapTarget(event.target),
    execution_target: mapTarget(event.target),
    runtime: event.runtime,
    auth_mode: run?.resolution.authMode,
    cost_bearer: run?.resolution.costBearer,
    status: statusFromEventType(event.type),
    created_at: event.createdAt,
    payload_inline: redactPayload(event.payload),
    replay: replayFromPayload(event.payload, event.runId),
    labels: ["local", event.runtime, event.target],
  });
}

export function platformEventFromCloudLog(event: CloudRunEvent, run?: CloudAutomationRun): PlatformEvent {
  return baseEvent({
    id: `pev_cloud_${event.id}`,
    workspace_id: event.workspaceId,
    actor_account_id: event.actorAccountId,
    device_id: event.deviceId,
    run_id: event.runId,
    automation_id: event.automationId,
    tool_call_id: event.toolCallId,
    source: event.source === "approval" ? "approval" : "cloud",
    actor_type: event.source === "scheduler" || event.source === "worker" ? "automation" : "agent",
    event_type: event.type,
    privacy_class: event.privacyClass,
    redaction_state: event.privacyClass === "distilled_cloud" ? "summarized" : "redacted",
    target: "cloud",
    execution_target: "cloud",
    runtime: "basics_cloud_worker",
    status: statusFromEventType(event.type),
    created_at: event.createdAt,
    cost: run ? cloudCost(run) : undefined,
    payload_inline: redactPayload(event.payload),
    replay: replayFromCloud(event, run),
    labels: ["cloud", event.source, event.automationId],
  });
}

export function platformEventFromAppLog(event: WorkspaceAppLogEvent): PlatformEvent {
  const source = event.runtime === "basichome_cli" ? "cli" : "app";
  return baseEvent({
    id: `pev_app_${event.id}`,
    workspace_id: DEFAULT_WORKSPACE_ID,
    actor_account_id: event.actorAccountId,
    device_id: event.deviceId,
    run_id: event.deploymentId ?? event.releaseId ?? event.appId,
    app_id: event.appId,
    tool_call_id: event.deploymentId,
    source,
    actor_type: source === "cli" ? "cli" : "app",
    event_type: event.type,
    privacy_class: "action_log",
    redaction_state: "redacted",
    target: mapTarget(event.target),
    execution_target: mapTarget(event.target),
    runtime: event.runtime,
    status: statusFromEventType(event.type),
    created_at: event.createdAt,
    payload_inline: redactPayload(event.payload),
    replay: replayFromPayload(event.payload, event.deploymentId ?? event.releaseId ?? event.appId),
    labels: ["app", event.appId, event.runtime],
  });
}

export function platformEventFromApprovalLog(event: WorkspaceApprovalLogEvent, approval = findApproval(readApprovalStore(), event.approvalId)): PlatformEvent {
  return baseEvent({
    id: `pev_approval_${event.id}`,
    workspace_id: approval?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    actor_account_id: event.actorAccountId,
    device_id: approval?.requestedFor === "device_local" ? approval.objectId : "workspace_policy",
    run_id: event.approvalId,
    app_id: approval?.appId,
    automation_id: approval?.automationId,
    approval_id: event.approvalId,
    trust_grant_id: approval?.trustGrantId,
    source: "approval",
    actor_type: "user",
    event_type: event.event,
    privacy_class: "action_log",
    redaction_state: "redacted",
    target: "workspace_admin",
    execution_target: "workspace_admin",
    runtime: "admin_review",
    status: statusFromEventType(event.event),
    created_at: event.createdAt,
    payload_inline: {
      actor_role: event.actorRole,
      object_name: approval?.objectName,
      required_role: approval?.requiredRole,
    },
    labels: ["approval", event.event, approval?.kind ?? "unknown"],
  });
}

export function platformEventFromContextAudit(event: ContextAuditEvent): PlatformEvent {
  return baseEvent({
    id: `pev_context_${event.id}`,
    workspace_id: DEFAULT_WORKSPACE_ID,
    actor_account_id: event.actorAccountId,
    device_id: event.deviceId,
    source: mapSource(event.source),
    actor_type: event.source === "lens" ? "lens" : event.source === "agent" ? "agent" : "user",
    event_type: event.eventType,
    privacy_class: event.privacyClass,
    redaction_state: event.redactionState,
    target: "local_device",
    execution_target: "local",
    runtime: "lens_local",
    status: statusFromEventType(event.eventType),
    created_at: event.createdAt,
    payload_ref: event.payloadRef,
    labels: ["context", event.privacyClass, event.source],
  });
}

function baseEvent(event: PlatformEvent): PlatformEvent {
  return event;
}

function applyFeedback(event: PlatformEvent, feedback: PlatformEventFeedback | undefined): PlatformEvent {
  return feedback
    ? {
        ...event,
        feedback,
        labels: Array.from(new Set([...event.labels, `feedback:${feedback.label}`])),
      }
    : event;
}

function enrichEventFromRun(event: PlatformEvent, run: LocalAgentRun | undefined): PlatformEvent {
  if (!run) return event;
  return {
    ...event,
    auth_mode: event.auth_mode ?? run.resolution.authMode,
    cost_bearer: event.cost_bearer ?? run.resolution.costBearer,
  };
}

function cloudCost(run: CloudAutomationRun): PlatformEventCost {
  return {
    api_credits_cents: run.usage.apiCreditsCents,
    model_tokens: run.usage.modelTokens,
    browser_minutes: run.usage.browserMinutes,
    worker_seconds: run.usage.workerSeconds,
  };
}

function replayFromCloud(event: CloudRunEvent, run: CloudAutomationRun | undefined) {
  const replayJsonl = stringFromPayload(event.payload, "replay_jsonl_url") ?? run?.worker.replayJsonlUrl;
  const screenshot = stringFromPayload(event.payload, "screenshot_ref") ?? stringFromPayload(event.payload, "s3_key");
  if (!replayJsonl && !screenshot && !run?.worker.liveViewUrl) return undefined;
  return {
    replay_id: `replay_${event.runId}`,
    replay_jsonl_url: replayJsonl,
    live_view_url: run?.worker.liveViewUrl,
    screenshot_ref: screenshot,
    frame_count: run?.replayFrames.length,
  };
}

function replayFromPayload(payload: Record<string, unknown> | undefined, fallbackId: string | undefined) {
  const replayJsonl = stringFromPayload(payload, "replay_jsonl_url");
  const screenshot = stringFromPayload(payload, "screenshot_ref") ?? stringFromPayload(payload, "s3_key");
  if (!replayJsonl && !screenshot) return undefined;
  return {
    replay_id: `replay_${fallbackId ?? "event"}`,
    replay_jsonl_url: replayJsonl,
    screenshot_ref: screenshot,
  };
}

function redactPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/cookie|token|secret|password|credential/i.test(key)) {
      redacted[key] = "[redacted]";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function stringFromPayload(payload: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" && value ? value : undefined;
}

function mapSource(source: string): PlatformEventSource {
  if (source === "lens") return "lens";
  if (source === "agent" || source === "worker" || source === "scheduler" || source === "browser" || source === "codex") return "agent";
  if (source === "cloud") return "cloud";
  if (source === "app" || source === "workspace_app_registry") return "app";
  if (source === "approval") return "approval";
  return "client";
}

function mapTarget(target: string): PlatformExecutionTarget {
  if (target === "cloud" || target === "basics_cloud") return "cloud";
  if (target === "local_and_cloud") return "local_and_cloud";
  if (target === "workspace_admin") return "workspace_admin";
  if (target === "device_local" || target === "local_device") return "local_device";
  return "local";
}

function statusFromEventType(type: string): PlatformEventStatus {
  if (/failed|error|denied/.test(type)) return "failed";
  if (/blocked|check_failed/.test(type)) return "blocked";
  if (/revoked/.test(type)) return "revoked";
  if (/rejected/.test(type)) return "rejected";
  if (/approved|approval_granted|auto_approved/.test(type)) return "approved";
  if (/paused|waiting/.test(type)) return "paused";
  if (/queued|requested|pending|review/.test(type)) return "needs_review";
  if (/started|start|running|heartbeat/.test(type)) return "running";
  if (/completed|complete|passed|done|created|deployed|installed|swept|updated|performed|saved/.test(type)) return "completed";
  return "info";
}

function eventMatchesObjectType(event: PlatformEvent, objectType: NonNullable<PlatformEventFilters["objectType"]>): boolean {
  if (objectType === "run") return Boolean(event.run_id && !event.app_id && !event.approval_id);
  if (objectType === "app") return Boolean(event.app_id);
  if (objectType === "automation") return Boolean(event.automation_id);
  if (objectType === "approval") return Boolean(event.approval_id);
  if (objectType === "device") return Boolean(event.device_id);
  return true;
}

function eventSearchHaystack(event: PlatformEvent): string {
  return [
    event.id,
    event.event_type,
    event.actor_account_id,
    event.device_id,
    event.run_id,
    event.app_id,
    event.automation_id,
    event.approval_id,
    event.payload_ref,
    JSON.stringify(event.payload_inline ?? {}),
  ].filter(Boolean).join(" ").toLowerCase();
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function isFailureFeedback(label: PlatformFeedbackLabel | undefined): label is PlatformFeedbackLabel {
  return label === "bad_action" || label === "wrong_context" || label === "too_risky" || label === "needs_review";
}
