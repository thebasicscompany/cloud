import { BASICHOME_ONBOARDING_STORAGE_KEY, type BasichomeOnboardingRecord } from "@/lib/onboarding";
import { createInitialLocalContextStore } from "@/mocks/local-context";
import type {
  AgentContextResult,
  CaptureStatus,
  ContextAuditEvent,
  DistilledContextSummary,
  LocalContextStore,
} from "@/types/local-context";

export const BASICHOME_LOCAL_CONTEXT_STORAGE_KEY = "basichome:lens:local-context:v1";

const DAY_MS = 24 * 60 * 60 * 1000;

export function readLocalContextStore(): LocalContextStore {
  if (typeof window === "undefined") {
    return createInitialLocalContextStore();
  }

  const stored = window.localStorage.getItem(BASICHOME_LOCAL_CONTEXT_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<LocalContextStore>;
      if (parsed.schemaVersion === 1 && parsed.status && Array.isArray(parsed.rawPointers) && Array.isArray(parsed.summaries)) {
        return parsed as LocalContextStore;
      }
    } catch {
      window.localStorage.removeItem(BASICHOME_LOCAL_CONTEXT_STORAGE_KEY);
    }
  }

  const seeded = createInitialLocalContextStore(readOnboardingRecord());
  writeLocalContextStore(seeded);
  return seeded;
}

export function writeLocalContextStore(store: LocalContextStore): LocalContextStore {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASICHOME_LOCAL_CONTEXT_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function setCaptureStatus(store: LocalContextStore, status: Extract<CaptureStatus, "running" | "paused">): LocalContextStore {
  const now = new Date().toISOString();
  return appendAudit({
    ...store,
    status: {
      ...store.status,
      status,
      lastCaptureAt: status === "running" ? now : store.status.lastCaptureAt,
    },
  }, `lens.capture.${status}`, "raw_local");
}

export function setRetentionDays(store: LocalContextStore, retentionDays: number): LocalContextStore {
  return appendAudit({
    ...store,
    status: {
      ...store.status,
      retentionDays,
      nextRetentionSweepAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  }, "lens.retention.updated", "action_log");
}

export function enforceLocalRetention(store: LocalContextStore): { store: LocalContextStore; deletedCount: number } {
  const cutoff = Date.now() - store.status.retentionDays * DAY_MS;
  const retainedRaw = store.rawPointers.filter((pointer) => new Date(pointer.capturedAt).getTime() >= cutoff);
  const retainedRawIds = new Set(retainedRaw.map((pointer) => pointer.id));
  const retainedSummaries = store.summaries.filter((summary) => {
    if (summary.approval.status === "denied") return false;
    return summary.rawRefs.every((ref) => retainedRawIds.has(ref));
  });
  const deletedCount = store.rawPointers.length - retainedRaw.length + store.summaries.length - retainedSummaries.length;

  const swept = appendAudit({
    ...store,
    rawPointers: retainedRaw,
    summaries: retainedSummaries,
    status: {
      ...store.status,
      nextRetentionSweepAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  }, "lens.retention.swept", "action_log");

  return { store: swept, deletedCount };
}

export function approveSummary(store: LocalContextStore, summaryId: string): LocalContextStore {
  const now = new Date().toISOString();
  return appendAudit({
    ...store,
    summaries: store.summaries.map((summary) =>
      summary.id === summaryId
        ? {
            ...summary,
            approval: {
              status: "approved",
              approvedBy: "local-dev-owner",
              approvedAt: now,
              policyId: summary.approval.policyId,
            },
            uploadState: "approved_for_cloud",
          }
        : summary,
    ),
  }, "lens.summary.approved", "distilled_cloud", summaryId);
}

export function queryApprovedLocalContextForAgent(store: LocalContextStore, query: string): AgentContextResult {
  const approved = store.summaries.filter(isApprovedSummary);
  return {
    queryId: createLocalId("ctx_query"),
    query,
    deviceId: store.status.deviceId,
    localProfileId: store.status.localProfileId,
    privacyClass: "distilled_cloud",
    returnedAt: new Date().toISOString(),
    rawItemsReturned: 0,
    summaries: approved.map((summary) => ({
      id: summary.id,
      title: summary.title,
      summary: summary.summary,
      timeRange: summary.timeRange,
      sourceApps: summary.sourceApps,
      memorySignals: summary.memorySignals,
      automationCandidate: summary.automationCandidate,
      approvalStatus: "approved",
    })),
  };
}

export function summarizePrivacyBoundary(store: LocalContextStore) {
  return {
    rawUploadEnabled: store.status.rawUploadEnabled,
    rawPointersLocalOnly: store.rawPointers.every((pointer) => pointer.privacyClass === "raw_local" && pointer.uploadState === "local_only"),
    agentQueryReturnsRaw: false,
    approvedSummaries: store.summaries.filter(isApprovedSummary).length,
    blockedSummaries: store.summaries.filter((summary) => summary.approval.status !== "approved").length,
  };
}

function isApprovedSummary(summary: DistilledContextSummary): boolean {
  return summary.privacyClass === "distilled_cloud" && summary.approval.status === "approved";
}

function appendAudit(
  store: LocalContextStore,
  eventType: string,
  privacyClass: ContextAuditEvent["privacyClass"],
  payloadRef?: string,
): LocalContextStore {
  const event: ContextAuditEvent = {
    id: createLocalId("evt"),
    eventType,
    source: eventType.startsWith("agent.") ? "agent" : eventType.startsWith("lens.") ? "lens" : "client",
    actorAccountId: eventType.startsWith("agent.") ? "agent_local" : "local-dev-owner",
    deviceId: store.status.deviceId,
    privacyClass,
    redactionState: privacyClass === "raw_local" ? "raw" : privacyClass === "action_log" ? "redacted" : "summarized",
    payloadRef,
    createdAt: new Date().toISOString(),
  };

  return {
    ...store,
    auditEvents: [event, ...store.auditEvents].slice(0, 24),
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

  return `${prefix}_${Date.now().toString(36)}`;
}
