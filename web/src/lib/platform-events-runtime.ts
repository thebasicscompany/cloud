import type {
  PlatformEvent,
  PlatformEventFeedback,
  PlatformEventFilters,
  PlatformEventStore,
  PlatformEventValidation,
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
