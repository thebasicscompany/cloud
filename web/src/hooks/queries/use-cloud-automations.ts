"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "sonner";

import type {
  CloudAutomation,
  CloudAutomationRun,
  CloudAutomationSummary,
} from "@/types/cloud-automation";

export const CLOUD_AUTOMATION_QUERY_KEY = ["cloud-automations"];

async function fetchAutomations(): Promise<CloudAutomationSummary[]> {
  const res = await fetch("/api/automations", { cache: "no-store" });
  if (!res.ok) return [];
  return ((await res.json()).automations ?? []) as CloudAutomationSummary[];
}

/** Real automations list — backed by /api/automations → automations table. */
export function useCloudAutomations() {
  return useQuery({
    queryKey: CLOUD_AUTOMATION_QUERY_KEY,
    queryFn: fetchAutomations,
  });
}

export function useCloudAutomation(id: string | undefined) {
  return useQuery({
    queryKey: [...CLOUD_AUTOMATION_QUERY_KEY, id],
    enabled: Boolean(id),
    queryFn: async (): Promise<{ automation: CloudAutomation; runs: CloudAutomationRun[] } | undefined> => {
      if (!id) return undefined;
      const res = await fetch(`/api/automations/${id}`, { cache: "no-store" });
      if (!res.ok) return undefined;
      return (await res.json()) as { automation: CloudAutomation; runs: CloudAutomationRun[] };
    },
  });
}

export function useCloudAutomationActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: CLOUD_AUTOMATION_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["agents-list"] });
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
  };

  const patch = (automationId: string, body: Record<string, unknown>) =>
    fetch(`/api/automations/${automationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "request failed");
      return r.json();
    });

  const triggerRun = (automationId: string) =>
    fetch(`/api/automations/${automationId}/run`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(
      async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "run failed");
        return r.json();
      },
    );

  const runNow = useMutation({ mutationFn: (automationId: string) => triggerRun(automationId), onSuccess: invalidate });
  const triggerSchedule = useMutation({ mutationFn: (automationId: string) => triggerRun(automationId), onSuccess: invalidate });
  // Replay re-runs the same automation goal as a fresh cloud run.
  const replayRun = useMutation({ mutationFn: (automationId: string) => triggerRun(automationId), onSuccess: invalidate });

  // Activate a draft/paused automation — registers its triggers (EventBridge
  // schedule + Composio) then flips it to active. Surfaces a clear error if a
  // trigger fails to register (cloud/api returns 422 with a message).
  const activate = useMutation({
    mutationFn: (automationId: string) =>
      fetch(`/api/automations/${automationId}/activate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }).then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
        if (!r.ok) throw new Error(data?.message ?? data?.error ?? "Couldn’t activate — a trigger may have failed to register.");
        return data;
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Automation activated — it runs automatically when its triggers fire.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn’t activate."),
  });
  const pause = useMutation({ mutationFn: (automationId: string) => patch(automationId, { action: "pause" }), onSuccess: invalidate });
  const resume = useMutation({ mutationFn: (automationId: string) => patch(automationId, { action: "resume" }), onSuccess: invalidate });
  const grantTrust = useMutation({ mutationFn: (automationId: string) => patch(automationId, { action: "grantTrust" }), onSuccess: invalidate });
  const revokeTrust = useMutation({ mutationFn: (automationId: string) => patch(automationId, { action: "revokeTrust" }), onSuccess: invalidate });
  const updateSchedule = useMutation({
    mutationFn: ({ automationId, cron, timezone }: { automationId: string; cron: string; timezone: string }) =>
      patch(automationId, { action: "updateSchedule", cron, timezone }),
    onSuccess: () => {
      invalidate();
      toast.success("Schedule saved.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn’t save the schedule."),
  });
  const clearSchedule = useMutation({
    mutationFn: (automationId: string) => patch(automationId, { action: "clearSchedule" }),
    onSuccess: () => {
      invalidate();
      toast.success("Switched to manual — it now only runs when you click Run now.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn’t update the trigger."),
  });
  const setRunTarget = useMutation({
    mutationFn: ({ automationId, target }: { automationId: string; target: "cloud" | "local" }) =>
      patch(automationId, { action: "setRunTarget", target }),
    onSuccess: invalidate,
  });
  // Hard delete — removes the automation AND all its runs (cloud/api ?purge=true).
  const deleteAutomation = useMutation({
    mutationFn: (automationId: string) =>
      fetch(`/api/automations/${automationId}`, { method: "DELETE" }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "delete failed");
        return r.json();
      }),
    onSuccess: invalidate,
  });

  return {
    runNow,
    triggerSchedule,
    activate,
    pause,
    resume,
    grantTrust,
    revokeTrust,
    replayRun,
    updateSchedule,
    clearSchedule,
    setRunTarget,
    deleteAutomation,
  };
}
