"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveWorkspaceAppRelease,
  deployWorkspaceAppRelease,
  listWorkspaceAppLogs,
  publishCliSampleRelease,
  readWorkspaceAppsStore,
  rollbackWorkspaceApp,
  selectActiveRelease,
  selectDeploymentsForApp,
  selectLatestRelease,
  selectPendingRelease,
  selectWorkspaceApp,
  writeWorkspaceAppsStore,
} from "@/lib/workspace-apps-runtime";
import type { WorkspaceApp, WorkspaceAppsStore } from "@/types/apps";

export const WORKSPACE_APPS_QUERY_KEY = ["workspace-apps"];

export function useWorkspaceAppsStore() {
  return useQuery({
    queryKey: WORKSPACE_APPS_QUERY_KEY,
    queryFn: async (): Promise<WorkspaceAppsStore> => {
      await delay();
      return readWorkspaceAppsStore();
    },
  });
}

export function useApps() {
  const query = useWorkspaceAppsStore();
  return {
    ...query,
    data: query.data?.apps ?? [],
  };
}

export function useWorkspaceApp(appId: string | undefined) {
  const query = useWorkspaceAppsStore();
  return {
    ...query,
    data: query.data
      ? {
          app: selectWorkspaceApp(query.data, appId),
          pendingRelease: appId ? selectPendingRelease(query.data, appId) : undefined,
          activeRelease: appId ? selectActiveRelease(query.data, appId) : undefined,
          latestRelease: appId ? selectLatestRelease(query.data, appId) : undefined,
          deployments: appId ? selectDeploymentsForApp(query.data, appId) : [],
        }
      : undefined,
  };
}

export function useWorkspaceAppLogs() {
  const query = useWorkspaceAppsStore();
  return {
    ...query,
    data: query.data ? listWorkspaceAppLogs(query.data) : [],
  };
}

export function useWorkspaceAppActions() {
  const queryClient = useQueryClient();

  const updateStore = (updater: (store: WorkspaceAppsStore) => WorkspaceAppsStore) => {
    const current = readWorkspaceAppsStore();
    const next = writeWorkspaceAppsStore(updater(current));
    queryClient.setQueryData(WORKSPACE_APPS_QUERY_KEY, next);
    void queryClient.invalidateQueries({ queryKey: ["apps"] });
    return next;
  };

  const publishCliSample = useMutation({
    mutationFn: async () => updateStore(publishCliSampleRelease),
  });

  const approveRelease = useMutation({
    mutationFn: async (releaseId: string) => updateStore((store) => approveWorkspaceAppRelease(store, releaseId)),
  });

  const deployRelease = useMutation({
    mutationFn: async (releaseId: string) => updateStore((store) => deployWorkspaceAppRelease(store, releaseId)),
  });

  const rollbackApp = useMutation({
    mutationFn: async (appId: string) => updateStore((store) => rollbackWorkspaceApp(store, appId)),
  });

  return {
    publishCliSample,
    approveRelease,
    deployRelease,
    rollbackApp,
  };
}

export function appNeedsReview(app: WorkspaceApp): boolean {
  return app.status === "pending_review" || app.status === "update_available" || app.status === "blocked";
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
