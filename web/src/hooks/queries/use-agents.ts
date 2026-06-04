"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Agent,
  AgentDraftMessage,
  AgentDraftPatch,
  AgentDraftResponse,
} from "@/types/agent";

export const AGENTS_KEY = ["agents"];

async function listAgents(): Promise<Agent[]> {
  // Throw on non-2xx so React Query's `error` becomes truthy. Previously
  // we silently returned [], which made an expired JWT / DB outage / "no
  // agents yet" look identical to the user. Status surfaces in the
  // thrown error so the library view can show "session expired" vs.
  // "agents are temporarily unavailable" instead of a generic empty.
  const r = await fetch("/api/agents", { cache: "no-store" });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
    const err = new Error(body.message ?? body.error ?? `Agents fetch failed (${r.status})`);
    (err as Error & { status?: number }).status = r.status;
    throw err;
  }
  const data = await r.json();
  return (data.agents ?? []) as Agent[];
}

async function getAgent(id: string): Promise<Agent | null> {
  const r = await fetch(`/api/agents/${id}`, { cache: "no-store" });
  if (!r.ok) return null;
  const data = await r.json();
  return (data.agent ?? data) as Agent;
}

export function useAgents() {
  return useQuery({ queryKey: AGENTS_KEY, queryFn: listAgents });
}

export function useAgent(id: string | undefined) {
  return useQuery({
    queryKey: [...AGENTS_KEY, id],
    enabled: Boolean(id),
    queryFn: () => (id ? getAgent(id) : Promise.resolve(null)),
  });
}

export function useAgentActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: AGENTS_KEY });

  const create = useMutation({
    mutationFn: async (body: Partial<Agent>) => {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "create failed");
      return (await r.json()) as { agent: Agent };
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<Agent> }) => {
      const r = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "update failed");
      return (await r.json()) as { agent: Agent };
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
    },
    onSuccess: invalidate,
  });

  const run = useMutation({
    mutationFn: async ({ id, goal }: { id: string; goal: string }) => {
      const r = await fetch(`/api/agents/${id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "run failed");
      return (await r.json()) as { runId: string };
    },
  });

  return { create, update, remove, run };
}

export async function draftWithBasics(
  messages: AgentDraftMessage[],
  partial: AgentDraftPatch,
): Promise<AgentDraftResponse> {
  const r = await fetch("/api/agents/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages, partial }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Basics is offline");
  return (await r.json()) as AgentDraftResponse;
}
