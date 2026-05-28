export type PlatformPrivacyClass =
  | "raw_local"
  | "distilled_cloud"
  | "action_log"
  | "training_allowed"
  | "training_denied";

export type PlatformRedactionState = "raw" | "redacted" | "summarized" | "deleted";

export type PlatformEventSource = "client" | "lens" | "agent" | "cloud" | "app" | "cli" | "approval";

export type PlatformActorType = "user" | "agent" | "automation" | "app" | "system" | "lens" | "cli";

export type PlatformExecutionTarget = "local" | "cloud" | "local_and_cloud" | "workspace_admin" | "local_device" | "vpc_future";

export type PlatformEventStatus =
  | "info"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "blocked"
  | "approved"
  | "rejected"
  | "revoked"
  | "needs_review";

export type PlatformFeedbackLabel =
  | "success"
  | "bad_action"
  | "wrong_context"
  | "too_risky"
  | "needs_review";

export type TrainingConsentMode = "disabled" | "evals_only" | "workflow_learning" | "org_model_training";

export type PlatformEventCost = {
  api_credits_cents?: number;
  model_tokens?: number;
  browser_minutes?: number;
  worker_seconds?: number;
  storage_bytes?: number;
};

export type PlatformEventFeedback = {
  label: PlatformFeedbackLabel;
  actor_account_id: string;
  created_at: string;
  note?: string;
};

export type PlatformReplayRef = {
  replay_id: string;
  replay_jsonl_url?: string;
  live_view_url?: string;
  screenshot_ref?: string;
  frame_count?: number;
};

export type PlatformEvent = {
  id: string;
  workspace_id: string;
  actor_account_id: string;
  subject_user_id?: string;
  device_id?: string;
  run_id?: string;
  conversation_id?: string;
  app_id?: string;
  automation_id?: string;
  approval_id?: string;
  trust_grant_id?: string;
  tool_call_id?: string;
  source: PlatformEventSource;
  actor_type: PlatformActorType;
  event_type: string;
  privacy_class: PlatformPrivacyClass;
  redaction_state: PlatformRedactionState;
  target: PlatformExecutionTarget;
  runtime?: string;
  execution_target?: PlatformExecutionTarget;
  auth_mode?: string;
  cost_bearer?: string;
  status: PlatformEventStatus;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  cost?: PlatformEventCost;
  payload_ref?: string;
  payload_inline?: Record<string, unknown>;
  replay?: PlatformReplayRef;
  feedback?: PlatformEventFeedback;
  consent_policy_id?: string;
  labels: string[];
};

export type PlatformEventFilters = {
  search?: string;
  source?: PlatformEventSource | "all";
  privacyClass?: PlatformPrivacyClass | "all";
  objectType?: "all" | "run" | "app" | "automation" | "approval" | "device";
  deviceId?: string | "all";
  feedback?: PlatformFeedbackLabel | "all" | "unlabeled";
};

export type PlatformEventValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type TrainingExportPreview = {
  id: string;
  workspace_id: string;
  mode: TrainingConsentMode;
  upload_enabled: boolean;
  raw_capture_included: false;
  created_at: string;
  included_event_ids: string[];
  excluded_event_ids: string[];
  privacy_classes: PlatformPrivacyClass[];
  blocked_reasons: string[];
  event_count: number;
};

export type PlatformReplayTrace = {
  id: string;
  subject_id: string;
  subject_type: "run" | "app" | "automation" | "approval" | "device";
  events: PlatformEvent[];
  failure_labels: PlatformFeedbackLabel[];
  replayable: boolean;
  training_export_preview: TrainingExportPreview;
};

export type PlatformEventStore = {
  schemaVersion: 1;
  trainingConsent: {
    mode: TrainingConsentMode;
    uploadEnabled: boolean;
    rawCaptureAllowed: false;
    consentPolicyId: string;
  };
  feedback: Record<string, PlatformEventFeedback>;
};
