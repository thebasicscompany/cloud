"use client";

import { useQuery } from "@tanstack/react-query";

import type { Run, RunStep, RunsFilter } from "@/types/runs";

/**
 * Runs are backed entirely by REAL cloud_runs from the Basics Supabase project
 * via /api/runs (server, service-role). No mock/local runs are merged anymore —
 * a stuck worker is reaped server-side and stale "live" runs are downgraded in
 * the mapper, so the list reflects real execution only.
 */
async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
  } catch {
    // network/offline — fall back
  }
  return fallback;
}

export function useRuns(filter: RunsFilter = {}) {
  return useQuery({
    queryKey: ["runs", filter],
    queryFn: async (): Promise<Run[]> => {
      const { runs } = await getJson<{ runs: Run[] }>("/api/runs", { runs: [] });
      return (runs ?? []).filter((run) => matches(run, filter));
    },
    refetchInterval: 8000,
  });
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ["run", runId],
    queryFn: async (): Promise<Run | null> => {
      if (!runId) return null;
      const { run } = await getJson<{ run: Run | null }>(`/api/runs/${runId}`, { run: null });
      return run ?? null;
    },
    enabled: Boolean(runId),
    refetchInterval: 5000,
  });
}

export function useRunSteps(runId: string | undefined) {
  return useQuery({
    queryKey: ["run-steps", runId],
    queryFn: async (): Promise<RunStep[]> => {
      if (!runId) return [];
      const { steps } = await getJson<{ steps: RunStep[] }>(`/api/runs/${runId}/steps`, { steps: [] });
      return steps ?? [];
    },
    enabled: Boolean(runId),
    refetchInterval: 5000,
  });
}

function matches(run: Run, filter: RunsFilter): boolean {
  if (filter.status && filter.status !== "all" && run.status !== filter.status) return false;
  if (filter.workflowId && run.workflowId !== filter.workflowId) return false;
  if (filter.search) {
    const needle = filter.search.toLowerCase();
    if (!run.id.toLowerCase().includes(needle) && !run.workflowName.toLowerCase().includes(needle)) {
      return false;
    }
  }
  return true;
}
