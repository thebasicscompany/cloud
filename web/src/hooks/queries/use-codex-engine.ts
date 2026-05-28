"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  readCodexEngineStore,
  setCodexEngineNotInstalled,
  setCodexEngineReady,
  setCodexEngineUnauthenticated,
  writeCodexEngineStore,
} from "@/lib/codex-engine";
import type { CodexEngineStore } from "@/types/codex-engine";

export const CODEX_ENGINE_QUERY_KEY = ["codex-engine"];

export function useCodexEngineStore() {
  return useQuery({
    queryKey: CODEX_ENGINE_QUERY_KEY,
    queryFn: async (): Promise<CodexEngineStore> => {
      await delay();
      return readCodexEngineStore();
    },
  });
}

export function useCodexEngineStatus() {
  const query = useCodexEngineStore();
  return {
    ...query,
    data: query.data?.status,
  };
}

export function useCodexEngineActions() {
  const queryClient = useQueryClient();

  const updateStore = (updater: (store: CodexEngineStore) => CodexEngineStore) => {
    const next = writeCodexEngineStore(updater(readCodexEngineStore()));
    queryClient.setQueryData(CODEX_ENGINE_QUERY_KEY, next);
    void queryClient.invalidateQueries({ queryKey: ["local-agent-runtime"] });
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
    return next;
  };

  const markReady = useMutation({
    mutationFn: async () => updateStore(setCodexEngineReady),
  });

  const markUnauthenticated = useMutation({
    mutationFn: async () => updateStore(setCodexEngineUnauthenticated),
  });

  const markNotInstalled = useMutation({
    mutationFn: async () => updateStore(setCodexEngineNotInstalled),
  });

  return {
    markReady,
    markUnauthenticated,
    markNotInstalled,
  };
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
