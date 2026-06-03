"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { Robot } from "@phosphor-icons/react";

import { ArrowUp, Pencil, Trash2 } from "@/icons";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgent, useAgentActions } from "@/hooks/queries/use-agents";
import type { Agent, AgentTarget } from "@/types/agent";

const TARGET_LABEL: Record<string, string> = {
  cloud: "Cloud",
  computer: "Computer use",
  chrome: "Your Chrome",
};

export function AgentChatRun({ id }: { id: string }) {
  const router = useRouter();
  const { data: agent, isLoading } = useAgent(id);
  const { run, remove, update } = useAgentActions();

  const [goal, setGoal] = useState("");
  const [history, setHistory] = useState<Array<{ id: string; goal: string; runId?: string; error?: string }>>([]);
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, [agent?.id]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl p-8 text-foreground/60 text-sm">Loading…</div>
    );
  }
  if (!agent) {
    return (
      <div className="mx-auto w-full max-w-2xl p-8 text-foreground/60 text-sm">
        Agent not found.{" "}
        <button type="button" onClick={() => router.push("/agents")} className="underline">
          Back to agents.
        </button>
      </div>
    );
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
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden p-6">
      <header className="flex items-center gap-3 pb-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground/5 text-2xl">
          {agent.avatar || <Robot weight="fill" className="size-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-lg">{agent.name}</h1>
          <div className="truncate text-foreground/60 text-xs">
            {TARGET_LABEL[agent.target] ?? agent.target}
            {agent.schedule?.enabled ? ` · ${agent.schedule.cron}` : ""}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} title="Edit" className="size-9 shrink-0 p-0">
          <Pencil className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void onDelete()}
          title="Delete"
          className="size-9 shrink-0 p-0 text-foreground/60 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </header>

      {editing ? (
        <EditPanel
          agent={agent}
          onClose={() => setEditing(false)}
          onSave={async (body) => {
            try {
              await update.mutateAsync({ id, body });
              toast.success("Saved.");
              setEditing(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save");
            }
          }}
        />
      ) : null}

      <div className="flex-1 space-y-2 overflow-y-auto rounded-2xl border bg-card p-4">
        {history.length === 0 ? (
          <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center text-foreground/60 text-sm">
            <p>Tell {agent.name} what to do.</p>
            <p className="mt-1 text-xs">It runs with the instructions, target, and tools you set up.</p>
          </div>
        ) : (
          history.map((row) => (
            <div key={row.id} className="rounded-lg border bg-background p-2.5 text-sm">
              <div className="line-clamp-3 whitespace-pre-wrap">{row.goal}</div>
              {row.runId ? (
                <div className="mt-1 text-foreground/60 text-xs">
                  <a href={`/runs/${row.runId}`} className="hover:underline">
                    Open run →
                  </a>
                </div>
              ) : row.error ? (
                <div className="mt-1 text-destructive text-xs">{row.error}</div>
              ) : (
                <div className="mt-1 text-foreground/60 text-xs">Starting run…</div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex items-end gap-2 rounded-2xl border bg-card p-2">
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
        <Button onClick={() => void send()} disabled={!goal.trim() || run.isPending} size="icon" className="size-9 shrink-0">
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function EditPanel({
  agent,
  onClose,
  onSave,
}: {
  agent: Agent;
  onClose: () => void;
  onSave: (body: Partial<Agent>) => Promise<void>;
}) {
  const [name, setName] = useState(agent.name);
  const [instructions, setInstructions] = useState(agent.instructions);
  const [target, setTarget] = useState<AgentTarget>(agent.target);
  return (
    <div className="mb-3 rounded-2xl border bg-card p-4">
      <div className="space-y-3">
        <div>
          <label className="text-foreground/60 text-xs">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-foreground/60 text-xs">Instructions</label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="mt-1 min-h-24 resize-none text-sm"
          />
        </div>
        <div>
          <label className="text-foreground/60 text-xs">Where it runs</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(["cloud", "computer", "chrome"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={`rounded-lg border p-2 text-sm transition-colors ${
                  target === t ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/30"
                }`}
              >
                {TARGET_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void onSave({ name, instructions, target })}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
