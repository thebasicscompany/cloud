"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Brain, Clock, FileSearch, Globe, KeyRound, Monitor, Pause, Play, Square } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveLocalAgentRun, useLocalAgentActions } from "@/hooks/queries/use-local-agent-runtime";
import type { LocalAgentRun, RuntimeTarget } from "@/types/local-agent";

import { VoiceButton } from "./voice-button";

const STARTER_PROMPT = "Use approved local context to summarize my invoice follow-up work and plan the next safe action.";

/** Desktop preload bridge (Model B). Present only inside the Electron app. */
interface BasichomeBridge {
  isDesktop?: boolean;
  localRelayStart?: (opts: { relayUrl: string; session: string; token: string }) => Promise<{ ok?: boolean; error?: string }>;
}
function desktopBridge(): BasichomeBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { basichome?: BasichomeBridge }).basichome;
}

export function LocalAgentWorkbench() {
  const { data: activeRun } = useActiveLocalAgentRun();
  const actions = useLocalAgentActions();
  const { push } = useRouter();
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [target, setTarget] = useState<RuntimeTarget>("auto");
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const activeTool = activeRun?.toolCalls.find((tool) => tool.id === activeRun.activeToolCallId);

  useEffect(() => {
    setIsDesktop(Boolean(desktopBridge()?.isDesktop));
  }, []);

  // Model B — "Run on my computer": provision a relay session, bridge the local
  // Chrome via the desktop, then trigger a cloud run that drives that browser.
  const runOnMyComputer = async () => {
    const bh = desktopBridge();
    if (!bh?.localRelayStart) {
      setTriggerError("Local runs need the desktop app.");
      return;
    }
    const task = prompt.trim() || STARTER_PROMPT;
    setTriggering(true);
    setTriggerError(null);
    try {
      const prov = await fetch("/api/runs/trigger-local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: task }),
      }).then((r) => r.json());
      if (!prov.ok) {
        setTriggerError(prov.error ?? "Local runs aren't available.");
        return;
      }
      const bridged = await bh.localRelayStart({ relayUrl: prov.relayUrl, session: prov.session, token: prov.token });
      if (!bridged?.ok) {
        setTriggerError(bridged?.error ?? "Could not connect your browser.");
        return;
      }
      const run = await fetch("/api/runs/trigger-local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: task, session: prov.session }),
      }).then((r) => r.json());
      if (run.ok && run.runId) {
        push(`/runs/${run.runId}`);
        return;
      }
      setTriggerError(run.error ?? "Could not start the local run.");
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  };

  // Append finalized voice transcripts to the prompt; interim results are ignored
  // so the textarea isn't flooded with partial guesses.
  const handleTranscript = (text: string, isFinal: boolean) => {
    if (!isFinal) return;
    const chunk = text.trim();
    if (!chunk) return;
    setPrompt((prev) => (prev ? `${prev.trimEnd()} ${chunk}` : chunk));
  };
  const canResume = activeRun?.status === "paused";
  const canPause = activeRun?.status === "running" || activeRun?.status === "thinking" || activeRun?.status === "waiting_for_approval";
  const canStop = activeRun && activeRun.status !== "complete" && activeRun.status !== "stopped" && activeRun.status !== "failed";

  // Starts a REAL cloud run via the deployed kicker → dispatcher → worker, then
  // opens the real run detail (live Browserbase view + activity trace). The
  // local store is also nudged so the overlay pill reflects activity.
  const startRun = async () => {
    const task = prompt.trim() || STARTER_PROMPT;
    setTriggering(true);
    setTriggerError(null);
    try {
      const goal =
        target === "local_browser" || target === "basics_cloud"
          ? `Use the browser if needed to: ${task}`
          : task;
      const res = await fetch("/api/runs/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json();
      if (data.ok && data.runId) {
        push(`/runs/${data.runId}`);
        return;
      }
      setTriggerError(data.error ?? "Could not start the cloud run.");
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <WorkbenchMetric icon={Monitor} label="Target" value={activeRun ? targetLabel(activeRun.resolution.selectedTarget) : "Auto"} detail="Cloud by default; run on your own computer when you choose." />
        <WorkbenchMetric icon={Brain} label="Runtime" value={activeRun ? runtimeLabel(activeRun) : "Basics Cloud"} detail="One run contract powers pill, dashboard, and logs." />
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="local-agent-prompt" className="font-medium text-sm">
                Ask basichome
              </label>
              <VoiceButton onTranscript={handleTranscript} />
            </div>
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
                <NativeSelectOption value="basics_cloud">Cloud agent</NativeSelectOption>
                <NativeSelectOption value="local_browser">Cloud browser</NativeSelectOption>
              </NativeSelect>
            </div>
            <Button type="button" className="w-full" onClick={startRun} disabled={triggering}>
              <Play className="size-4" />
              {triggering ? "Starting cloud run…" : "Start run"}
            </Button>
            {isDesktop ? (
              <Button type="button" variant="outline" className="w-full" onClick={runOnMyComputer} disabled={triggering}>
                <Monitor className="size-4" />
                Run on my computer
              </Button>
            ) : null}
            {triggerError ? <p className="text-destructive text-xs">{triggerError}</p> : null}
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
              Engine auth and cost stay explicit: your local engine account for local runs, workspace credits for cloud.
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
  if (target === "codex_app_server") return "Local engine";
  if (target === "codex_exec") return "Local engine (exec)";
  if (target === "local_browser") return "Local browser";
  if (target === "local_app") return "Local app";
  return "Local device";
}

function runtimeLabel(run: LocalAgentRun): string {
  if (run.resolution.runtime === "codex_app_server") return "Local engine";
  if (run.resolution.runtime === "codex_exec") return "Local engine (exec)";
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
