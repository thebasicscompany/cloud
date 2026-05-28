"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  completeLocalAgentRun,
  getActiveLocalAgentRun,
  listLocalAgentLogs,
  pauseLocalAgentRun,
  promoteLocalAgentRunToCloud,
  readLocalAgentStore,
  resumeLocalAgentRun,
  startLocalAgentRun,
  stopLocalAgentRun,
  takeOverLocalBrowserRun,
  watchLocalBrowserRun,
  writeLocalAgentStore,
} from "@/lib/local-agent-runtime";
import type { BrowserRunStartOptions } from "@/types/browser-runtime";
import type { LocalAgentStore, RuntimeTarget } from "@/types/local-agent";

export const LOCAL_AGENT_STORE_QUERY_KEY = ["local-agent-runtime"];

export function useLocalAgentStore() {
  return useQuery({
    queryKey: LOCAL_AGENT_STORE_QUERY_KEY,
    queryFn: async (): Promise<LocalAgentStore> => {
      await delay();
      return readLocalAgentStore();
    },
  });
}

export function useActiveLocalAgentRun() {
  const query = useLocalAgentStore();
  return {
    ...query,
    data: query.data ? getActiveLocalAgentRun(query.data) : undefined,
  };
}

export function useLocalAgentLogs() {
  const query = useLocalAgentStore();
  return {
    ...query,
    data: query.data ? listLocalAgentLogs(query.data) : [],
  };
}

export function useLocalAgentActions() {
  const queryClient = useQueryClient();

  const updateStore = (updater: (store: LocalAgentStore) => LocalAgentStore) => {
    const current = readLocalAgentStore();
    const next = writeLocalAgentStore(updater(current));
    queryClient.setQueryData(LOCAL_AGENT_STORE_QUERY_KEY, next);
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
    void queryClient.invalidateQueries({ queryKey: ["run"] });
    void queryClient.invalidateQueries({ queryKey: ["run-steps"] });
    return next;
  };

  const start = useMutation({
    mutationFn: async ({ prompt, target, options }: { prompt: string; target: RuntimeTarget; options?: BrowserRunStartOptions }) => updateStore((store) => startLocalAgentRun(store, prompt, target, undefined, options)),
  });

  const pause = useMutation({
    mutationFn: async (runId: string) => updateStore((store) => pauseLocalAgentRun(store, runId)),
  });

  const resume = useMutation({
    mutationFn: async (runId: string) => updateStore((store) => resumeLocalAgentRun(store, runId)),
  });

  const stop = useMutation({
    mutationFn: async (runId: string) => updateStore((store) => stopLocalAgentRun(store, runId)),
  });

  const promote = useMutation({
    mutationFn: async (runId: string) => updateStore((store) => promoteLocalAgentRunToCloud(store, runId)),
  });

  const watchBrowser = useMutation({
    mutationFn: async (runId: string) => updateStore((store) => watchLocalBrowserRun(store, runId)),
  });

  const takeOverBrowser = useMutation({
    mutationFn: async (runId: string) => updateStore((store) => takeOverLocalBrowserRun(store, runId)),
  });

  const complete = useMutation({
    mutationFn: async (runId: string) => updateStore((store) => completeLocalAgentRun(store, runId)),
  });

  return {
    start,
    pause,
    resume,
    stop,
    promote,
    watchBrowser,
    takeOverBrowser,
    complete,
  };
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
