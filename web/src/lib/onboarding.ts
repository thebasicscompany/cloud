export const BASICHOME_ONBOARDING_STORAGE_KEY = "basichome:onboarding:v1";
export const BASICHOME_ONBOARDING_EVENT_KEY = "basichome:onboarding:last-event:v1";

export type OnboardingPermissionStatus = "not_started" | "granted" | "skipped";

export type BasichomeOnboardingRecord = {
  schemaVersion: 1;
  completedAt: string;
  workspace: {
    id: string;
    name: string;
    role: "owner";
    adminApprovalRequired: true;
  };
  device: {
    id: string;
    name: string;
    localProfileId: string;
  };
  permissions: Record<string, OnboardingPermissionStatus>;
  capture: {
    enabled: boolean;
    status: "running" | "paused";
    retentionDays: number;
    storageLocation: string;
    rawCloudUpload: false;
    distilledCloudRequiresApproval: boolean;
  };
  engine: {
    mode: "codex_local" | "basics_managed" | "byok";
    apiKeyRequired: boolean;
  };
  policy: {
    appInstallApproval: boolean;
    firstAutomationRunApproval: boolean;
    cloudDeployApproval: boolean;
    trainingEnabled: false;
    dailyCloudBudgetUsd: number;
  };
};

export function isOnboardingComplete(value: string | null): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as Partial<BasichomeOnboardingRecord>;
    return parsed.schemaVersion === 1 && typeof parsed.completedAt === "string";
  } catch {
    return false;
  }
}
