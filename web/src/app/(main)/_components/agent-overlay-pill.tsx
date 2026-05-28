"use client";

import Link from "next/link";
import { useState } from "react";

import { Brain, Clock, FileSearch, Globe, Monitor, Pause, Play, Square } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useActiveLocalAgentRun, useLocalAgentActions } from "@/hooks/queries/use-local-agent-runtime";
import { cn } from "@/lib/utils";
import type { LocalAgentRun } from "@/types/local-agent";

export function AgentOverlayPill() {
  const { data: activeRun } = useActiveLocalAgentRun();
  const actions = useLocalAgentActions();
  const [expanded, setExpanded] = useState(false);
  const activeTool = activeRun?.toolCalls.find((tool) => tool.id === activeRun.activeToolCallId);
  const isRunnable = activeRun && activeRun.status !== "complete" && activeRun.status !== "stopped" && activeRun.status !== "failed";

  return (
    <aside className="fixed right-4 bottom-4 z-50 w-[min(380px,calc(100vw-2rem))]">
      <div className="rounded-lg border bg-background/95 shadow-lg backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", activeRun ? toneClass(activeRun) : "bg-primary/10 text-primary")}>
              {activeRun ? <StateIcon run={activeRun} /> : <Brain className="size-4" />}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-sm">{activeRun ? activeRun.taskTitle : "basichome idle"}</div>
              <div className="truncate text-muted-foreground text-xs">
                {activeRun ? `${statusLabel(activeRun)} · ${targetLabel(activeRun.resolution.selectedTarget)}` : "Ready for local work"}
              </div>
            </div>
          </div>
          <Badge variant={activeRun ? "default" : "outline"} className="h-auto min-h-5 shrink-0 py-0.5">
            {activeRun ? statusLabel(activeRun) : "Idle"}
          </Badge>
        </button>

        {expanded ? (
          <div className="space-y-3 border-t p-3">
            {activeRun ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <PillFact label="run_id" value={activeRun.runId} />
                  <PillFact label="runtime" value={runtimeLabel(activeRun)} />
                  <PillFact label="target" value={targetLabel(activeRun.resolution.selectedTarget)} />
                  <PillFact label="tool" value={activeTool?.name ?? "None"} />
                </div>
                <div className="rounded-lg border bg-muted/20 p-2 text-muted-foreground text-xs">
                  {activeRun.events[0]?.message ?? "Waiting for events."}
                </div>
                <div className="flex flex-wrap gap-2">
                  {isRunnable && activeRun.status !== "paused" ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void actions.pause.mutate(activeRun.runId)}>
                      <Pause className="size-4" />
                      Pause
                    </Button>
                  ) : null}
                  {activeRun.status === "paused" ? (
                    <Button type="button" size="sm" onClick={() => void actions.resume.mutate(activeRun.runId)}>
                      <Play className="size-4" />
                      Resume
                    </Button>
                  ) : null}
                  {isRunnable ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void actions.stop.mutate(activeRun.runId)}>
                      <Square className="size-4" />
                      Stop
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href={`/runs/${activeRun.runId}`} prefetch={false}>
                      <Monitor className="size-4" />
                      Run
                    </Link>
                  </Button>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <Link href="/logs" prefetch={false}>
                      <FileSearch className="size-4" />
                      Logs
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 text-muted-foreground text-sm">
                <Clock className="mt-0.5 size-4" />
                <p>Start a task from the home workbench. The pill will show run state, target, active tool, and controls.</p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function StateIcon({ run }: { run: LocalAgentRun }) {
  if (run.status === "waiting_for_approval") return <Globe className="size-4" />;
  if (run.status === "paused") return <Pause className="size-4" />;
  if (run.status === "complete" || run.status === "stopped") return <Square className="size-4" />;
  return <Brain className="size-4" />;
}

function PillFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 px-2 py-1.5">
      <div className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</div>
      <div className="truncate font-mono text-xs">{value}</div>
    </div>
  );
}

function toneClass(run: LocalAgentRun): string {
  if (run.status === "failed") return "bg-destructive/10 text-destructive";
  if (run.status === "waiting_for_approval") return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (run.status === "paused") return "bg-muted text-muted-foreground";
  if (run.status === "complete" || run.status === "stopped") return "bg-primary/10 text-primary";
  return "bg-primary/10 text-primary";
}

function statusLabel(run: LocalAgentRun): string {
  if (run.status === "waiting_for_approval") return "Approval";
  if (run.status === "paused") return "Paused";
  if (run.status === "stopped") return "Stopped";
  if (run.status === "complete") return "Complete";
  if (run.status === "failed") return "Failed";
  return "Running";
}

function targetLabel(target: LocalAgentRun["resolution"]["selectedTarget"]): string {
  if (target === "basics_cloud") return "Cloud";
  if (target === "codex_app_server") return "Codex";
  if (target === "codex_exec") return "Codex exec";
  if (target === "local_browser") return "Browser";
  if (target === "local_app") return "App";
  return "Device";
}

function runtimeLabel(run: LocalAgentRun): string {
  return run.resolution.runtime.replace("basics_", "").replaceAll("_", " ");
}
