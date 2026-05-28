"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Brain, Code2, Clock, FileSearch, Globe, KeyRound, Monitor, Pause, Play, ShieldCheck, Square } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useCodexEngineStatus } from "@/hooks/queries/use-codex-engine";
import { useActiveLocalAgentRun, useLocalAgentActions } from "@/hooks/queries/use-local-agent-runtime";
import type { LocalAgentRun, RuntimeTarget } from "@/types/local-agent";

const STARTER_PROMPT = "Use approved local context to summarize my invoice follow-up work and plan the next safe action.";

export function LocalAgentWorkbench() {
  const { data: activeRun } = useActiveLocalAgentRun();
  const { data: codexStatus } = useCodexEngineStatus();
  const actions = useLocalAgentActions();
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [target, setTarget] = useState<RuntimeTarget>("auto");
  const activeTool = useMemo(() => activeRun?.toolCalls.find((tool) => tool.id === activeRun.activeToolCallId), [activeRun]);
  const canResume = activeRun?.status === "paused";
  const canPause = activeRun?.status === "running" || activeRun?.status === "thinking" || activeRun?.status === "waiting_for_approval";
  const canStop = activeRun && activeRun.status !== "complete" && activeRun.status !== "stopped" && activeRun.status !== "failed";

  const startRun = async () => {
    const task = prompt.trim() || STARTER_PROMPT;
    await actions.start.mutateAsync({ prompt: task, target });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <WorkbenchMetric icon={Monitor} label="Target" value={activeRun ? targetLabel(activeRun.resolution.selectedTarget) : "Auto"} detail="Local first, cloud when the task needs durability." />
        <WorkbenchMetric icon={Brain} label="Runtime" value={activeRun ? runtimeLabel(activeRun) : "Basics Local"} detail="One run contract powers pill, dashboard, and logs." />
        <WorkbenchMetric
          icon={codexStatus?.state === "ready" ? Code2 : ShieldCheck}
          label="Codex"
          value={codexStatus ? codexStatusLabel(codexStatus.state) : "Checking"}
          detail={codexStatus?.state === "ready" ? "Uses your local Codex account for app/code work." : "Explicit Codex runs fail closed until reconnected."}
        />
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <label htmlFor="local-agent-prompt" className="font-medium text-sm">
              Ask basichome
            </label>
            <Textarea
              id="local-agent-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-24 resize-none bg-background"
              placeholder="Tell basichome what to do locally..."
            />
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="local-agent-target" className="font-medium text-sm">
                Engine / target
              </label>
              <NativeSelect id="local-agent-target" value={target} onChange={(event) => setTarget(event.target.value as RuntimeTarget)} className="w-full bg-background">
                <NativeSelectOption value="auto">Auto</NativeSelectOption>
                <NativeSelectOption value="local_device">Local device</NativeSelectOption>
                <NativeSelectOption value="local_browser">Local browser</NativeSelectOption>
                <NativeSelectOption value="local_app">Local app</NativeSelectOption>
                <NativeSelectOption value="codex_app_server">Codex app-server</NativeSelectOption>
                <NativeSelectOption value="codex_exec">Codex exec JSON</NativeSelectOption>
                <NativeSelectOption value="basics_cloud">Basics Cloud</NativeSelectOption>
              </NativeSelect>
            </div>
            <Button type="button" className="w-full" onClick={startRun} disabled={actions.start.isPending}>
              <Play className="size-4" />
              Start local run
            </Button>
          </div>
        </div>
      </div>

      {activeRun ? (
        <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                <Badge>{statusLabel(activeRun)}</Badge>
                <Badge variant="outline">{targetLabel(activeRun.resolution.selectedTarget)}</Badge>
                <Badge variant="outline">{activeRun.resolution.authMode.replaceAll("_", " ")}</Badge>
                <Badge variant="secondary">{activeRun.resolution.costBearer.replaceAll("_", " ")}</Badge>
              </div>
                <h3 className="mt-3 font-semibold text-base">{activeRun.taskTitle}</h3>
                <p className="mt-1 font-mono text-muted-foreground text-xs">{activeRun.runId}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canPause ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void actions.pause.mutate(activeRun.runId)}>
                    <Pause className="size-4" />
                    Pause
                  </Button>
                ) : null}
                {canResume ? (
                  <Button type="button" size="sm" onClick={() => void actions.resume.mutate(activeRun.runId)}>
                    <Play className="size-4" />
                    Resume
                  </Button>
                ) : null}
                {canStop ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void actions.stop.mutate(activeRun.runId)}>
                    <Square className="size-4" />
                    Stop
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SmallStat label="Active tool" value={activeTool?.name ?? "None"} />
              <SmallStat label="Events" value={activeRun.events.length.toString()} />
              <SmallStat label="Updated" value={formatRelative(activeRun.updatedAt)} />
            </div>
            <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-muted-foreground text-sm">
              {activeRun.events[0]?.message ?? "No events yet."}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold text-sm">Run controls</h3>
            <div className="mt-3 grid gap-2">
              <Button type="button" variant="outline" className="justify-start" onClick={() => void actions.promote.mutate(activeRun.runId)}>
                <Globe className="size-4" />
                Promote to cloud
              </Button>
              <Button type="button" variant="outline" className="justify-start" asChild>
                <Link href={`/runs/${activeRun.runId}`} prefetch={false}>
                  <Monitor className="size-4" />
                  Open run detail
                </Link>
              </Button>
              <Button type="button" variant="outline" className="justify-start" asChild>
                <Link href="/logs" prefetch={false}>
                  <FileSearch className="size-4" />
                  Inspect logs
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              Every control writes a normalized event with run id, actor, device, target, runtime, and timestamp.
            </p>
            <div className="mt-3 rounded-lg border bg-muted/20 p-2 text-muted-foreground text-xs">
              <KeyRound className="mr-1 inline size-3.5" />
              Codex auth and cost stay explicit: local Codex account for local Codex runs, workspace credits for cloud.
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-5 text-muted-foreground text-sm">
          No active local run. Start a task to see the overlay pill, run detail, and logs update together.
        </div>
      )}
    </div>
  );
}

function WorkbenchMetric({ icon: Icon, label, value, detail }: { icon: typeof Monitor; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 font-semibold text-sm">{value}</div>
      <div className="mt-1 text-muted-foreground text-xs">{detail}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 truncate font-medium text-sm">{value}</div>
    </div>
  );
}

function statusLabel(run: LocalAgentRun): string {
  if (run.status === "waiting_for_approval") return "Waiting for approval";
  if (run.status === "paused") return "Paused";
  if (run.status === "stopped") return "Stopped";
  if (run.status === "complete") return "Complete";
  if (run.status === "failed") return "Failed";
  return "Running";
}

function targetLabel(target: Exclude<RuntimeTarget, "auto">): string {
  if (target === "basics_cloud") return "Basics Cloud";
  if (target === "codex_app_server") return "Codex app-server";
  if (target === "codex_exec") return "Codex exec JSON";
  if (target === "local_browser") return "Local browser";
  if (target === "local_app") return "Local app";
  return "Local device";
}

function runtimeLabel(run: LocalAgentRun): string {
  if (run.resolution.runtime === "codex_app_server") return "Codex app-server";
  if (run.resolution.runtime === "codex_exec") return "Codex exec JSON";
  if (run.resolution.runtime === "basics_cloud_worker") return "Cloud worker";
  if (run.resolution.runtime === "basics_local_browser") return "Local browser";
  if (run.resolution.runtime === "basics_local_app") return "Local app";
  return "Local runner";
}

function codexStatusLabel(state: string): string {
  if (state === "ready") return "Ready";
  if (state === "not_installed") return "Not installed";
  if (state === "not_authenticated") return "Reconnect";
  if (state === "blocked_by_policy") return "Blocked";
  return "Unsupported";
}

function formatRelative(value: string): string {
  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(deltaMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
