export const BASICHOME_ONBOARDING_STORAGE_KEY = "basichome:onboarding:v1";
export const BASICHOME_ONBOARDING_EVENT_KEY = "basichome:onboarding:last-event:v1";

export type OnboardingPermissionStatus = "not_started" | "granted" | "skipped";

export type ClientOS = "mac" | "windows" | "other";

type BasichomeBridge = {
  // Electron preload may expose the Node process platform ("darwin" | "win32" | ...).
  platform?: string;
};

declare global {
  interface Window {
    basichome?: BasichomeBridge;
  }
}

/**
 * Detect the operating system on the client.
 *
 * Resolution order:
 * 1. Electron preload bridge (`window.basichome.platform`) when present - most reliable.
 * 2. `navigator.userAgentData.platform` (modern, high-entropy hint).
 * 3. `navigator.platform` / `navigator.userAgent` string sniffing as a fallback.
 *
 * Returns "other" during SSR or when the platform cannot be determined.
 */
export function detectClientOS(): ClientOS {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "other";
  }

  const bridgePlatform = window.basichome?.platform;
  if (typeof bridgePlatform === "string") {
    const normalized = bridgePlatform.toLowerCase();
    if (normalized === "darwin" || normalized.includes("mac")) {
      return "mac";
    }
    if (normalized === "win32" || normalized.includes("win")) {
      return "windows";
    }
  }

  const uaDataPlatform = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform;
  const platformHint = `${uaDataPlatform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();

  if (platformHint.includes("mac") || platformHint.includes("darwin")) {
    return "mac";
  }
  if (platformHint.includes("win")) {
    return "windows";
  }

  return "other";
}

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

/**
 * Lightweight v2 record - the new onboarding (welcome -> permissions ->
 * workspace -> first agent -> ready) writes this shape. The fields are
 * a fraction of v1 because the new flow doesn't ask the user to pick an
 * engine mode or set per-policy approval defaults; sensible defaults live
 * in settings and most users will never touch them.
 */
export type BasichomeOnboardingRecordV2 = {
  schemaVersion: 2;
  completedAt: string;
  workspace: { name: string };
  firstAgentSeed?: string;
  permissions?: Record<"screen" | "microphone" | "accessibility", OnboardingPermissionStatus>;
};

export function isOnboardingComplete(value: string | null): boolean {
  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as Partial<BasichomeOnboardingRecord | BasichomeOnboardingRecordV2>;
    const v = parsed.schemaVersion;
    return (v === 1 || v === 2) && typeof parsed.completedAt === "string";
  } catch {
    return false;
  }
}
