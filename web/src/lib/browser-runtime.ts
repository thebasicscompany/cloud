import type {
  BrowserLoginPrompt,
  BrowserProfileRecord,
  BrowserRunStartOptions,
  BrowserRuntimeStore,
  BrowserRuntimeTarget,
  BrowserRunViewMode,
} from "@/types/browser-runtime";

export const BASICHOME_BROWSER_RUNTIME_STORAGE_KEY = "basichome:browser-runtime:v1";

const LOCAL_PROFILE_ROOT = "~/Library/Application Support/basichome/browser-profiles/device_local_dev";

export function createInitialBrowserRuntimeStore(): BrowserRuntimeStore {
  const seededAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    defaultTarget: "local_managed_browser",
    localProfileRoot: LOCAL_PROFILE_ROOT,
    profiles: [
      {
        id: "profile_local_news",
        label: "News research",
        domain: "news.ycombinator.com",
        storagePath: `${LOCAL_PROFILE_ROOT}/news.ycombinator.com`,
        status: "ready",
        source: "managed_local",
        cookieCount: 0,
        localStorageKeyCount: 0,
        deviceOnly: true,
        encryptedAt: seededAt,
        lastLoginAt: seededAt,
        cloudSyncStatus: "not_synced",
      },
      {
        id: "profile_local_jobboard",
        label: "JobBoard Pro",
        domain: "jobboardpro.example",
        storagePath: `${LOCAL_PROFILE_ROOT}/jobboardpro.example`,
        status: "needs_login",
        source: "managed_local",
        cookieCount: 0,
        localStorageKeyCount: 0,
        deviceOnly: true,
        cloudSyncStatus: "not_synced",
      },
    ],
    runViewModes: {},
    cloudPromotions: [],
  };
}

export function readBrowserRuntimeStore(): BrowserRuntimeStore {
  if (typeof window === "undefined") return createInitialBrowserRuntimeStore();

  const stored = window.localStorage.getItem(BASICHOME_BROWSER_RUNTIME_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<BrowserRuntimeStore>;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.profiles)) {
        return {
          ...createInitialBrowserRuntimeStore(),
          ...parsed,
          runViewModes: parsed.runViewModes ?? {},
          cloudPromotions: parsed.cloudPromotions ?? [],
        } as BrowserRuntimeStore;
      }
    } catch {
      window.localStorage.removeItem(BASICHOME_BROWSER_RUNTIME_STORAGE_KEY);
    }
  }

  const seeded = createInitialBrowserRuntimeStore();
  writeBrowserRuntimeStore(seeded);
  return seeded;
}

export function writeBrowserRuntimeStore(store: BrowserRuntimeStore): BrowserRuntimeStore {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASICHOME_BROWSER_RUNTIME_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function setDefaultBrowserTarget(store: BrowserRuntimeStore, target: BrowserRuntimeTarget): BrowserRuntimeStore {
  return { ...store, defaultTarget: target };
}

export function openBrowserLoginPrompt(store: BrowserRuntimeStore, domainInput: string): BrowserRuntimeStore {
  const domain = normalizeBrowserDomain(domainInput);
  const now = new Date().toISOString();
  const existingProfile = selectManagedProfileForDomain(store, domain);
  const profile =
    existingProfile ??
    createManagedProfile({
      domain,
      status: "needs_login",
      now,
    });
  const profiles = upsertProfile(store.profiles, {
    ...profile,
    status: "needs_login",
    lastUsedAt: now,
  });
  const activeLoginPrompt: BrowserLoginPrompt = {
    id: `login_${domain.replace(/\W/g, "_")}_${Date.now()}`,
    profileId: profile.id,
    domain,
    status: "open",
    openedAt: now,
  };

  return {
    ...store,
    profiles,
    activeLoginPrompt,
  };
}

export function saveBrowserLoginPrompt(store: BrowserRuntimeStore): BrowserRuntimeStore {
  if (!store.activeLoginPrompt) return store;

  const now = new Date().toISOString();
  const prompt = store.activeLoginPrompt;
  const profiles = store.profiles.map((profile) => {
    if (profile.id !== prompt.profileId) return profile;
    return {
      ...profile,
      status: "ready" as const,
      cookieCount: Math.max(profile.cookieCount, 8),
      localStorageKeyCount: Math.max(profile.localStorageKeyCount, 3),
      encryptedAt: now,
      lastLoginAt: now,
      lastUsedAt: now,
      cloudSyncStatus: "not_synced" as const,
    };
  });

  return {
    ...store,
    profiles,
    activeLoginPrompt: {
      ...prompt,
      status: "saved",
      savedAt: now,
    },
  };
}

export function cancelBrowserLoginPrompt(store: BrowserRuntimeStore): BrowserRuntimeStore {
  if (!store.activeLoginPrompt) return store;
  return {
    ...store,
    activeLoginPrompt: {
      ...store.activeLoginPrompt,
      status: "cancelled",
    },
  };
}

export function revokeBrowserProfile(store: BrowserRuntimeStore, profileId: string): BrowserRuntimeStore {
  const now = new Date().toISOString();
  return {
    ...store,
    profiles: store.profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            status: "revoked",
            cookieCount: 0,
            localStorageKeyCount: 0,
            encryptedAt: undefined,
            lastUsedAt: now,
            cloudSyncStatus: "not_synced",
          }
        : profile,
    ),
  };
}

export function recordBrowserRunViewMode(store: BrowserRuntimeStore, runId: string, mode: BrowserRunViewMode): BrowserRuntimeStore {
  return {
    ...store,
    runViewModes: {
      ...store.runViewModes,
      [runId]: mode,
    },
  };
}

export function recordBrowserCloudPromotion(store: BrowserRuntimeStore, runId: string, domainInput: string): BrowserRuntimeStore {
  const domain = normalizeBrowserDomain(domainInput);
  const requestedAt = new Date().toISOString();
  return {
    ...store,
    profiles: store.profiles.map((profile) =>
      profile.domain === domain
        ? {
            ...profile,
            cloudSyncStatus: "approval_required" as const,
            lastUsedAt: requestedAt,
          }
        : profile,
    ),
    cloudPromotions: [
      {
        runId,
        domain,
        status: "approval_required" as const,
        requestedAt,
      },
      ...store.cloudPromotions.filter((promotion) => promotion.runId !== runId),
    ].slice(0, 8),
  };
}

export function selectManagedProfileForDomain(store: BrowserRuntimeStore, domainInput: string): BrowserProfileRecord | undefined {
  const domain = normalizeBrowserDomain(domainInput);
  return store.profiles.find((profile) => profile.domain === domain && profile.source === "managed_local" && profile.status !== "revoked");
}

export function selectBrowserProfileForRun(store: BrowserRuntimeStore, target: BrowserRuntimeTarget, options: BrowserRunStartOptions): BrowserProfileRecord | undefined {
  const domain = normalizeBrowserDomain(options.browserDomain ?? domainFromBrowserPrompt(options.browserUrl ?? options.browserTitle ?? ""));
  if (target === "local_visible_browser") {
    return {
      id: "profile_active_browser_explicit",
      label: "Active browser",
      domain,
      storagePath: "active-browser://selected-window",
      status: "ready",
      source: "active_browser",
      cookieCount: 0,
      localStorageKeyCount: 0,
      deviceOnly: true,
      cloudSyncStatus: "not_synced",
    };
  }
  if (target === "basics_cloud_browser") {
    return {
      id: "profile_cloud_browser_site",
      label: "Basics Cloud Browser",
      domain,
      storagePath: "basics-cloud://workspace-browser-sites",
      status: "ready",
      source: "basics_cloud",
      cookieCount: 0,
      localStorageKeyCount: 0,
      deviceOnly: false,
      cloudSyncStatus: "approval_required",
    };
  }
  return selectManagedProfileForDomain(store, domain);
}

export function normalizeBrowserDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "example.com";
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split(/\s+/)[0] || "example.com";
  }
}

export function domainFromBrowserPrompt(prompt: string): string {
  const lower = prompt.toLowerCase();
  const explicit = lower.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z0-9.-]+)/i)?.[1];
  if (explicit) return normalizeBrowserDomain(explicit);
  if (lower.includes("hacker news")) return "news.ycombinator.com";
  if (lower.includes("hubspot")) return "app.hubspot.com";
  if (lower.includes("quickbooks") || lower.includes("invoice")) return "app.qbo.intuit.com";
  if (lower.includes("jobboard")) return "jobboardpro.example";
  return "example.com";
}

export function browserTargetLabel(target: BrowserRuntimeTarget): string {
  if (target === "local_visible_browser") return "Use my active browser";
  if (target === "local_headless_browser") return "Background browser";
  if (target === "basics_cloud_browser") return "Basics Cloud Browser";
  return "Managed local browser";
}

export function browserTargetShortLabel(target: BrowserRuntimeTarget): string {
  if (target === "local_visible_browser") return "Active browser";
  if (target === "local_headless_browser") return "Background Browser";
  if (target === "basics_cloud_browser") return "Basics Cloud Browser";
  return "Local Browser";
}

function createManagedProfile(input: { domain: string; status: BrowserProfileRecord["status"]; now: string }): BrowserProfileRecord {
  return {
    id: `profile_local_${input.domain.replace(/\W/g, "_")}`,
    label: input.domain,
    domain: input.domain,
    storagePath: `${LOCAL_PROFILE_ROOT}/${input.domain}`,
    status: input.status,
    source: "managed_local",
    cookieCount: 0,
    localStorageKeyCount: 0,
    deviceOnly: true,
    lastUsedAt: input.now,
    cloudSyncStatus: "not_synced",
  };
}

function upsertProfile(profiles: BrowserProfileRecord[], profile: BrowserProfileRecord): BrowserProfileRecord[] {
  if (profiles.some((item) => item.id === profile.id)) {
    return profiles.map((item) => (item.id === profile.id ? profile : item));
  }
  return [profile, ...profiles];
}
