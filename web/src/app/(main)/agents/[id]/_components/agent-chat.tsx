"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { ArrowUp, Pencil, Sparkles, Trash2 } from "@/icons";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgent, useAgentActions } from "@/hooks/queries/use-agents";

const TARGET_LABEL: Record<string, string> = {
  cloud: "Cloud",
  computer: "Computer use",
  chrome: "Your Chrome",
};

export function AgentChatRun({ id }: { id: string }) {
  const router = useRouter();
  const { data: agent, isLoading } = useAgent(id);
  const { run, remove } = useAgentActions();

  const [goal, setGoal] = useState("");
  const [history, setHistory] = useState<Array<{ id: string; goal: string; runId?: string; error?: string }>>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, [agent?.id]);

  if (isLoading) {
    return <div className="mx-auto w-full max-w-2xl p-8 text-muted-foreground text-sm">Loading…</div>;
  }
  if (!agent) {
    return <div className="mx-auto w-full max-w-2xl p-8 text-muted-foreground text-sm">Agent not found.</div>;
  }

  const send = async () => {
    const text = goal.trim();
    if (!text) return;
    const localId = `local-${Date.now()}`;
    setHistory((h) => [...h, { id: localId, goal: text }]);
    setGoal("");
    try {
      const result = await run.mutateAsync({ id, goal: text });
      setHistory((h) => h.map((row) => (row.id === localId ? { ...row, runId: result.runId } : row)));
      router.push(`/runs/${result.runId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Run failed";
      setHistory((h) => h.map((row) => (row.id === localId ? { ...row, error: msg } : row)));
      toast.error(msg);
    }
  };

  const onDelete = async () => {
    if (!confirm(`Delete ${agent.name}?`)) return;
    try {
      await remove.mutateAsync(id);
      router.push("/agents");
    } catch {
      toast.error("Could not delete");
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col p-6">
      <header className="flex items-center gap-3 pb-4">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent/40 text-2xl">
          {agent.avatar || <Sparkles className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-lg">{agent.name}</h1>
          <div className="text-muted-foreground text-xs">
            {TARGET_LABEL[agent.target] ?? agent.target}
            {agent.schedule?.enabled ? ` · Scheduled (${agent.schedule.cron})` : ""}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => router.push(`/agents/${id}/edit`)} title="Edit">
          <Pencil className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void onDelete()} title="Delete" className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border bg-card p-4">
        {history.length === 0 ? (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-center text-muted-foreground text-sm">
            <p>Tell {agent.name} what to do.</p>
            <p className="mt-1 text-xs">It runs with the instructions, target, and tools you set up.</p>
          </div>
        ) : (
          history.map((row) => (
            <div key={row.id} className="rounded-md border bg-background p-2.5 text-sm">
              <div className="line-clamp-3 whitespace-pre-wrap">{row.goal}</div>
              {row.runId ? (
                <div className="mt-1 text-muted-foreground text-xs">
                  <a href={`/runs/${row.runId}`} className="hover:underline">
                    Open run →
                  </a>
                </div>
              ) : row.error ? (
                <div className="mt-1 text-destructive text-xs">{row.error}</div>
              ) : (
                <div className="mt-1 text-muted-foreground text-xs">Starting run…</div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex items-end gap-2 rounded-lg border bg-card p-2">
        <Textarea
          ref={taRef}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={`What should ${agent.name} do?`}
          className="min-h-12 resize-none border-0 focus-visible:ring-0"
          rows={2}
          disabled={run.isPending}
        />
        <Button onClick={() => void send()} disabled={!goal.trim() || run.isPending} size="sm">
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  );
}
