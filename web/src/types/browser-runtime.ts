export type BrowserRuntimeTarget =
  | "local_managed_browser"
  | "local_visible_browser"
  | "local_headless_browser"
  | "basics_cloud_browser";

export type BrowserProfileStatus = "ready" | "needs_login" | "expired" | "revoked";

export type BrowserProfileSource = "managed_local" | "active_browser" | "basics_cloud";

export type BrowserProfileRecord = {
  id: string;
  label: string;
  domain: string;
  storagePath: string;
  status: BrowserProfileStatus;
  source: BrowserProfileSource;
  cookieCount: number;
  localStorageKeyCount: number;
  deviceOnly: boolean;
  encryptedAt?: string;
  lastLoginAt?: string;
  lastUsedAt?: string;
  cloudSyncStatus: "not_synced" | "approval_required" | "synced_to_cloud";
};

export type BrowserLoginPrompt = {
  id: string;
  profileId: string;
  domain: string;
  status: "open" | "saved" | "cancelled";
  openedAt: string;
  savedAt?: string;
};

export type BrowserRunViewMode = "agent_control" | "watching" | "user_takeover";

export type BrowserRunState = {
  runtimeTarget: BrowserRuntimeTarget;
  profileId?: string;
  profilePath?: string;
  domain: string;
  currentUrl: string;
  pageTitle: string;
  status: "starting" | "running" | "needs_login" | "promoting_to_cloud" | "stopped";
  liveViewUrl?: string;
  screenshotRef?: string;
  cookieCount?: number;
  localStorageKeyCount?: number;
  loginRequired: boolean;
  viewMode: BrowserRunViewMode;
  cloudPromotionStatus?: "not_requested" | "approval_required" | "queued";
};

export type BrowserRuntimeStore = {
  schemaVersion: 1;
  defaultTarget: BrowserRuntimeTarget;
  localProfileRoot: string;
  profiles: BrowserProfileRecord[];
  activeLoginPrompt?: BrowserLoginPrompt;
  runViewModes: Record<string, BrowserRunViewMode>;
  cloudPromotions: Array<{
    runId: string;
    domain: string;
    status: "approval_required" | "queued";
    requestedAt: string;
  }>;
};

export type BrowserRunStartOptions = {
  browserRuntimeTarget?: BrowserRuntimeTarget;
  browserDomain?: string;
  browserUrl?: string;
  browserTitle?: string;
  requiresLogin?: boolean;
  userSelectedActiveBrowser?: boolean;
};
