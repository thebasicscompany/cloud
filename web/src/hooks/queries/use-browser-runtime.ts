"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelBrowserLoginPrompt,
  openBrowserLoginPrompt,
  readBrowserRuntimeStore,
  recordBrowserCloudPromotion,
  recordBrowserRunViewMode,
  revokeBrowserProfile,
  saveBrowserLoginPrompt,
  setDefaultBrowserTarget,
  writeBrowserRuntimeStore,
} from "@/lib/browser-runtime";
import type { BrowserRuntimeStore, BrowserRuntimeTarget, BrowserRunViewMode } from "@/types/browser-runtime";

export const BROWSER_RUNTIME_QUERY_KEY = ["browser-runtime"];

export function useBrowserRuntimeStore() {
  return useQuery({
    queryKey: BROWSER_RUNTIME_QUERY_KEY,
    queryFn: async (): Promise<BrowserRuntimeStore> => {
      await delay();
      return readBrowserRuntimeStore();
    },
  });
}

export function useBrowserRuntimeActions() {
  const queryClient = useQueryClient();

  const updateStore = (updater: (store: BrowserRuntimeStore) => BrowserRuntimeStore) => {
    const current = readBrowserRuntimeStore();
    const next = writeBrowserRuntimeStore(updater(current));
    queryClient.setQueryData(BROWSER_RUNTIME_QUERY_KEY, next);
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
    void queryClient.invalidateQueries({ queryKey: ["run"] });
    void queryClient.invalidateQueries({ queryKey: ["run-steps"] });
    return next;
  };

  const setDefaultTarget = useMutation({
    mutationFn: async (target: BrowserRuntimeTarget) => updateStore((store) => setDefaultBrowserTarget(store, target)),
  });

  const openLogin = useMutation({
    mutationFn: async (domain: string) => updateStore((store) => openBrowserLoginPrompt(store, domain)),
  });

  const saveLogin = useMutation({
    mutationFn: async () => updateStore(saveBrowserLoginPrompt),
  });

  const cancelLogin = useMutation({
    mutationFn: async () => updateStore(cancelBrowserLoginPrompt),
  });

  const revokeProfile = useMutation({
    mutationFn: async (profileId: string) => updateStore((store) => revokeBrowserProfile(store, profileId)),
  });

  const setRunViewMode = useMutation({
    mutationFn: async ({ runId, mode }: { runId: string; mode: BrowserRunViewMode }) => updateStore((store) => recordBrowserRunViewMode(store, runId, mode)),
  });

  const recordCloudPromotion = useMutation({
    mutationFn: async ({ runId, domain }: { runId: string; domain: string }) => updateStore((store) => recordBrowserCloudPromotion(store, runId, domain)),
  });

  return {
    setDefaultTarget,
    openLogin,
    saveLogin,
    cancelLogin,
    revokeProfile,
    setRunViewMode,
    recordCloudPromotion,
  };
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
