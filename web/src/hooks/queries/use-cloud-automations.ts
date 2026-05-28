"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  findCloudAutomation,
  grantCloudAutomationTrust,
  listCloudAutomationLogs,
  listCloudAutomationRunsFor,
  listCloudAutomationSummaries,
  pauseCloudAutomation,
  promoteLocalRunToCloudAutomation,
  readCloudAutomationStore,
  replayCloudAutomationRun,
  resumeCloudAutomation,
  revokeCloudAutomationTrust,
  runCloudAutomationNow,
  updateCloudAutomationSchedule,
  writeCloudAutomationStore,
} from "@/lib/cloud-automation-runtime";
import { readLocalAgentStore } from "@/lib/local-agent-runtime";
import type { CloudAutomationStore } from "@/types/cloud-automation";

export const CLOUD_AUTOMATION_QUERY_KEY = ["cloud-automation-runtime"];

export function useCloudAutomationStore() {
  return useQuery({
    queryKey: CLOUD_AUTOMATION_QUERY_KEY,
    queryFn: async (): Promise<CloudAutomationStore> => {
      await delay();
      return readCloudAutomationStore();
    },
  });
}

export function useCloudAutomations() {
  const query = useCloudAutomationStore();
  return {
    ...query,
    data: query.data ? listCloudAutomationSummaries(query.data) : [],
  };
}

export function useCloudAutomation(id: string | undefined) {
  const query = useCloudAutomationStore();
  return {
    ...query,
    data: query.data && id
      ? {
          automation: findCloudAutomation(query.data, id),
          runs: listCloudAutomationRunsFor(query.data, id),
        }
      : undefined,
  };
}

export function useCloudAutomationLogs() {
  const query = useCloudAutomationStore();
  return {
    ...query,
    data: query.data ? listCloudAutomationLogs(query.data) : [],
  };
}

export function useCloudAutomationActions() {
  const queryClient = useQueryClient();

  const updateStore = (updater: (store: CloudAutomationStore) => CloudAutomationStore) => {
    const current = readCloudAutomationStore();
    const next = writeCloudAutomationStore(updater(current));
    queryClient.setQueryData(CLOUD_AUTOMATION_QUERY_KEY, next);
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
    void queryClient.invalidateQueries({ queryKey: ["run"] });
    void queryClient.invalidateQueries({ queryKey: ["run-steps"] });
    void queryClient.invalidateQueries({ queryKey: ["run-checks"] });
    return next;
  };

  const promoteLatestLocal = useMutation({
    mutationFn: async () => {
      const localStore = readLocalAgentStore();
      const localRun = localStore.runs[0];
      return updateStore((store) => promoteLocalRunToCloudAutomation(store, localRun));
    },
  });

  const runNow = useMutation({
    mutationFn: async (automationId: string) => updateStore((store) => runCloudAutomationNow(store, automationId, "manual")),
  });

  const triggerSchedule = useMutation({
    mutationFn: async (automationId: string) => updateStore((store) => runCloudAutomationNow(store, automationId, "scheduled")),
  });

  const pause = useMutation({
    mutationFn: async (automationId: string) => updateStore((store) => pauseCloudAutomation(store, automationId)),
  });

  const resume = useMutation({
    mutationFn: async (automationId: string) => updateStore((store) => resumeCloudAutomation(store, automationId)),
  });

  const grantTrust = useMutation({
    mutationFn: async (automationId: string) => updateStore((store) => grantCloudAutomationTrust(store, automationId)),
  });

  const revokeTrust = useMutation({
    mutationFn: async (automationId: string) => updateStore((store) => revokeCloudAutomationTrust(store, automationId)),
  });

  const replayRun = useMutation({
    mutationFn: async (runId: string) => updateStore((store) => replayCloudAutomationRun(store, runId)),
  });

  const updateSchedule = useMutation({
    mutationFn: async ({ automationId, cron, timezone }: { automationId: string; cron: string; timezone: string }) =>
      updateStore((store) => updateCloudAutomationSchedule(store, automationId, cron, timezone)),
  });

  return {
    promoteLatestLocal,
    runNow,
    triggerSchedule,
    pause,
    resume,
    grantTrust,
    revokeTrust,
    replayRun,
    updateSchedule,
  };
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
