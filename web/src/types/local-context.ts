import type { OnboardingPermissionStatus } from "@/lib/onboarding";

export type ContextPrivacyClass =
  | "raw_local"
  | "distilled_cloud"
  | "action_log"
  | "training_allowed"
  | "training_denied";

export type CapturePermissionId =
  | "screen_recording"
  | "accessibility"
  | "input_control"
  | "audio"
  | "browser_profile";

export type CapturePermissionMap = Record<CapturePermissionId, OnboardingPermissionStatus>;

export type CaptureDataKind =
  | "screenshot"
  | "ocr"
  | "accessibility_tree"
  | "audio_transcript"
  | "input_timeline"
  | "app_window"
  | "browser_activity";

export type CaptureStatus = "running" | "paused" | "blocked" | "error";

export type LocalContextStatus = {
  service: "lens_local";
  status: CaptureStatus;
  workspaceId: string;
  deviceId: string;
  localProfileId: string;
  storageRoot: string;
  retentionDays: number;
  rawUploadEnabled: false;
  encryptedAtRest: boolean;
  eventDrivenCapture: boolean;
  permissions: CapturePermissionMap;
  lastCaptureAt: string;
  nextRetentionSweepAt: string;
  captureTriggers: string[];
  localApi: {
    baseUrl: string;
    auth: "loopback_bearer";
    exposesRawData: boolean;
  };
};

export type RawContextPointer = {
  id: string;
  kind: CaptureDataKind;
  privacyClass: "raw_local";
  capturedAt: string;
  retainedUntil: string;
  sourceApp: string;
  windowTitle: string;
  localPath: string;
  byteSize: number;
  textSource?: "accessibility" | "ocr" | "audio" | "input" | "metadata";
  redactionState: "raw" | "redacted" | "summarized" | "deleted";
  uploadState: "local_only";
};

export type DistilledContextSummary = {
  id: string;
  privacyClass: "distilled_cloud";
  title: string;
  summary: string;
  timeRange: {
    start: string;
    end: string;
  };
  deviceId: string;
  localProfileId: string;
  sourceApps: string[];
  sourceWindows: string[];
  rawRefs: string[];
  memorySignals: string[];
  automationCandidate?: string;
  approval: {
    status: "approved" | "pending" | "denied";
    approvedBy?: string;
    approvedAt?: string;
    policyId: string;
  };
  uploadState: "not_uploaded" | "approved_for_cloud" | "denied";
};

export type ContextAuditEvent = {
  id: string;
  eventType: string;
  source: "client" | "lens" | "agent";
  actorAccountId: string;
  deviceId: string;
  privacyClass: ContextPrivacyClass;
  redactionState: "raw" | "redacted" | "summarized" | "deleted";
  payloadRef?: string;
  createdAt: string;
};

export type AgentContextResult = {
  queryId: string;
  query: string;
  deviceId: string;
  localProfileId: string;
  privacyClass: "distilled_cloud";
  returnedAt: string;
  rawItemsReturned: 0;
  summaries: Array<{
    id: string;
    title: string;
    summary: string;
    timeRange: DistilledContextSummary["timeRange"];
    sourceApps: string[];
    memorySignals: string[];
    automationCandidate?: string;
    approvalStatus: "approved";
  }>;
};

export type LocalContextStore = {
  schemaVersion: 1;
  status: LocalContextStatus;
  rawPointers: RawContextPointer[];
  summaries: DistilledContextSummary[];
  auditEvents: ContextAuditEvent[];
};
