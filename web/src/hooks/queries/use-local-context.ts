"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveSummary,
  enforceLocalRetention,
  queryApprovedLocalContextForAgent,
  readLocalContextStore,
  setCaptureStatus,
  setRetentionDays,
  summarizePrivacyBoundary,
  writeLocalContextStore,
} from "@/lib/local-context";
import type { AgentContextResult, ContextAuditEvent, LocalContextStore } from "@/types/local-context";

const LOCAL_CONTEXT_QUERY_KEY = ["local-context-store"];

export function useLocalContextStore() {
  return useQuery({
    queryKey: LOCAL_CONTEXT_QUERY_KEY,
    queryFn: async (): Promise<LocalContextStore> => {
      await delay();
      return readLocalContextStore();
    },
  });
}

export function useLocalContextActions() {
  const queryClient = useQueryClient();

  const updateStore = (updater: (store: LocalContextStore) => LocalContextStore) => {
    const current = readLocalContextStore();
    const next = writeLocalContextStore(updater(current));
    queryClient.setQueryData(LOCAL_CONTEXT_QUERY_KEY, next);
    return next;
  };

  const pause = useMutation({
    mutationFn: async () => updateStore((store) => setCaptureStatus(store, "paused")),
  });

  const resume = useMutation({
    mutationFn: async () => updateStore((store) => setCaptureStatus(store, "running")),
  });

  const setRetention = useMutation({
    mutationFn: async (days: number) => updateStore((store) => setRetentionDays(store, days)),
  });

  const sweepRetention = useMutation({
    mutationFn: async () => {
      const current = readLocalContextStore();
      const result = enforceLocalRetention(current);
      const next = writeLocalContextStore(result.store);
      queryClient.setQueryData(LOCAL_CONTEXT_QUERY_KEY, next);
      return result;
    },
  });

  const approve = useMutation({
    mutationFn: async (summaryId: string) => updateStore((store) => approveSummary(store, summaryId)),
  });

  const queryAgentContext = useMutation({
    mutationFn: async (query: string): Promise<AgentContextResult> => {
      const store = readLocalContextStore();
      const result = queryApprovedLocalContextForAgent(store, query);
      const event: ContextAuditEvent = {
        id: result.queryId,
        eventType: "agent.context_query.local_distilled",
        source: "agent",
        actorAccountId: "agent_local",
        deviceId: store.status.deviceId,
        privacyClass: "distilled_cloud",
        redactionState: "summarized",
        payloadRef: result.summaries[0]?.id,
        createdAt: result.returnedAt,
      };
      const next = writeLocalContextStore({
        ...store,
        auditEvents: [event, ...store.auditEvents].slice(0, 24),
      });
      queryClient.setQueryData(LOCAL_CONTEXT_QUERY_KEY, next);
      return result;
    },
  });

  return {
    pause,
    resume,
    setRetention,
    sweepRetention,
    approve,
    queryAgentContext,
  };
}

export function usePrivacyBoundary(store: LocalContextStore | undefined) {
  return store ? summarizePrivacyBoundary(store) : undefined;
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
