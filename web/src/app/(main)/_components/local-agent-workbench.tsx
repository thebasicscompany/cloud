"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { Brain, Clock, FileSearch, Globe, KeyRound, Monitor, Pause, Play, Square } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveLocalAgentRun, useLocalAgentActions } from "@/hooks/queries/use-local-agent-runtime";
import type { LocalAgentRun, RuntimeTarget } from "@/types/local-agent";

import { VoiceButton } from "./voice-button";

const STARTER_PROMPT = "Use approved local context to summarize my invoice follow-up work and plan the next safe action.";

/** Desktop preload bridge (Model B). Present only inside the Electron app. */
interface CuStep {
  step?: number;
  text?: string;
  error?: string;
  actions?: Array<{ type?: string }>;
}
interface BasichomeBridge {
  isDesktop?: boolean;
  platform?: string;
  localRelayStart?: (opts: { relayUrl: string; session: string; token: string; mode?: string; port?: number }) => Promise<{ ok?: boolean; error?: string }>;
  computerUseStart?: (goal: string) => Promise<{ done?: boolean; text?: string; steps?: number; error?: string; stopped?: boolean; canContinue?: boolean }>;
  computerUseStop?: () => void;
  computerUseContinue?: () => Promise<{ done?: boolean; text?: string; steps?: number; error?: string; stopped?: boolean; canContinue?: boolean }>;
  onComputerUseStep?: (cb: (s: CuStep) => void) => () => void;
  openExternal?: (url: string) => Promise<{ ok?: boolean; error?: string }>;
}

// The shell command that turns on Chrome remote debugging, per platform. Shown
// verbatim in the setup dialog (option 2) so the user can copy & paste.
function chromeDebugCommand(platform: string | undefined): string {
  if (platform === "win32") {
    return `"%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=*`;
  }
  if (platform === "linux") {
    return `google-chrome --remote-debugging-port=9222 --remote-allow-origins=*`;
  }
  return `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222 --remote-allow-origins=*`;
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
  const [where, setWhere] = useState<"cloud" | "computer" | "computer-full">("cloud");
  const [cuSteps, setCuSteps] = useState<CuStep[]>([]);
  const [cuRunning, setCuRunning] = useState(false);
  const [cuResult, setCuResult] = useState<string | null>(null);
  const [cuCanContinue, setCuCanContinue] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [chromeSetupOpen, setChromeSetupOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const activeTool = activeRun?.toolCalls.find((tool) => tool.id === activeRun.activeToolCallId);

  useEffect(() => {
    setIsDesktop(Boolean(desktopBridge()?.isDesktop));
    // Hand-off from a just-recorded routine (the pill writes this on Stop, same
    // origin = shared localStorage) so the loop continues into building an
    // automation instead of dead-ending at a document.
    try {
      const handoff = window.localStorage.getItem("basichome:routine-prompt");
      if (handoff) {
        setPrompt(handoff);
        window.localStorage.removeItem("basichome:routine-prompt");
      }
    } catch {
      /* localStorage unavailable - ignore */
    }
  }, []);

  // If Home is already open when a routine recording stops, pick up the hand-off
  // live (storage events fire in other windows of the same origin).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "basichome:routine-prompt" && e.newValue) {
        setPrompt(e.newValue);
        try {
          window.localStorage.removeItem("basichome:routine-prompt");
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Same-window hand-off: the Home "Suggested automations" card dispatches this
  // when the user clicks Build (storage events don't fire in the same window).
  useEffect(() => {
    const onUsePrompt = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.trim()) {
        setPrompt(detail);
        promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        promptRef.current?.focus();
      }
    };
    window.addEventListener("basichome:use-prompt", onUsePrompt as EventListener);
    return () => window.removeEventListener("basichome:use-prompt", onUsePrompt as EventListener);
  }, []);

  // Model B - "Run on my computer": provision a relay session, bridge the local
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
      // attach (not managed): drive the user's REAL Chrome on the debug port so
      // their logins/cookies are used, instead of a throwaway isolated profile.
      // Attaching triggers Chrome's "allow debugging" prompt - surface a clear
      // heads-up so the user knows to go click Allow, kept up until it resolves.
      const allowToast = toast.loading(
        'Go to your Chrome window and click "Allow" on the debugging prompt so the agent can drive it.',
      );
      const bridged = await bh
        .localRelayStart({
          relayUrl: prov.relayUrl,
          session: prov.session,
          token: prov.token,
          mode: "attach",
          port: 9222,
        })
        .finally(() => toast.dismiss(allowToast));
      if (!bridged?.ok) {
        const msg = bridged?.error ?? "";
        // Specific case: user's Chrome isn't running with remote debugging.
        // Pop the setup helper instead of dumping a wall of CLI flags into a
        // toast; the helper opens chrome://inspect#remote-debugging in their
        // Chrome and lets them retry with one click.
        if (/debug port|remote-debugging|CDP/i.test(msg)) {
          setChromeSetupOpen(true);
          return;
        }
        setTriggerError(
          msg || "Couldn't reach your Chrome. Open Chrome with remote debugging on, then try again.",
        );
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

  // Full computer control (beta): hand the goal to the desktop computer-use loop
  // (eyes→brain→hands), streaming each step here. Drives the real machine, so
  // it's desktop-only and the user can Stop at any point.
  const runFullComputerControl = async () => {
    const bh = desktopBridge();
    if (!bh?.computerUseStart) {
      setTriggerError("Full computer control needs the desktop app.");
      return;
    }
    const task = prompt.trim() || STARTER_PROMPT;
    setCuSteps([]);
    setCuResult(null);
    setCuCanContinue(false);
    setCuRunning(true);
    setTriggerError(null);
    const off = bh.onComputerUseStep?.((s) => setCuSteps((prev) => [...prev, s].slice(-12)));
    try {
      const res = await bh.computerUseStart(task);
      if (res?.error) setTriggerError(res.error);
      else setCuResult(res?.stopped ? "Stopped." : res?.text || "Done.");
      setCuCanContinue(Boolean(res?.canContinue));
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : String(e));
    } finally {
      off?.();
      setCuRunning(false);
    }
  };

  // Resume after a step-cap stop. Same conversation on the desktop side; we just
  // stream a fresh batch of steps and update the result/continue affordance.
  const continueFullComputerControl = async () => {
    const bh = desktopBridge();
    if (!bh?.computerUseContinue) return;
    setCuResult(null);
    setCuCanContinue(false);
    setCuRunning(true);
    setTriggerError(null);
    const off = bh.onComputerUseStep?.((s) => setCuSteps((prev) => [...prev, s].slice(-12)));
    try {
      const res = await bh.computerUseContinue();
      if (res?.error) setTriggerError(res.error);
      else setCuResult(res?.stopped ? "Stopped." : res?.text || "Done.");
      setCuCanContinue(Boolean(res?.canContinue));
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : String(e));
    } finally {
      off?.();
      setCuRunning(false);
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
      const goal = task;
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
        <WorkbenchMetric icon={Monitor} label="Where it runs" value={activeRun ? targetLabel(activeRun.resolution.selectedTarget) : where === "computer" ? "My computer" : "Cloud"} detail="Basics Cloud, or your own Chrome when you choose." />
        <WorkbenchMetric icon={Brain} label="Status" value={activeRun ? runtimeLabel(activeRun) : "Idle"} detail="Where this task runs. Watch it live, or review it after." />
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="local-agent-prompt" className="font-medium text-sm">
                Ask Basics
              </label>
              <VoiceButton onTranscript={handleTranscript} />
            </div>
            <Textarea
              ref={promptRef}
              id="local-agent-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-24 resize-none bg-background"
              placeholder="Tell Basics what to do…"
            />
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="run-where" className="font-medium text-sm">
                Where it runs
              </label>
              <NativeSelect
                id="run-where"
                value={where}
                onChange={(event) => setWhere(event.target.value as "cloud" | "computer" | "computer-full")}
                className="w-full bg-background"
              >
                <NativeSelectOption value="cloud">Cloud (recommended)</NativeSelectOption>
                {isDesktop ? (
                  <NativeSelectOption value="computer">My computer - your Chrome</NativeSelectOption>
                ) : null}
                {isDesktop ? (
                  <NativeSelectOption value="computer-full">My computer - full control (beta)</NativeSelectOption>
                ) : null}
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                {where === "computer-full"
                  ? "Drives your whole computer - mouse, keyboard, any app. It takes over while it works; you can Stop anytime."
                  : where === "computer"
                    ? "Drives your own Chrome with your logins. Keep Chrome open."
                    : "Runs on Basics Cloud - watch it live, review it after."}
              </p>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() =>
                void (where === "computer-full" ? runFullComputerControl() : where === "computer" ? runOnMyComputer() : startRun())
              }
              disabled={triggering || cuRunning}
            >
              <Play className="size-4" />
              {cuRunning ? "Working…" : triggering ? "Starting…" : where === "computer-full" ? "Take control" : where === "computer" ? "Run on my computer" : "Start run"}
            </Button>
            {where === "computer-full" && cuRunning ? (
              <Button type="button" variant="outline" className="w-full" onClick={() => desktopBridge()?.computerUseStop?.()}>
                <Square className="size-4" />
                Stop
              </Button>
            ) : null}
            {triggerError ? <p className="text-destructive text-xs">{triggerError}</p> : null}
          </div>
        </div>
      </div>

      {cuRunning || cuSteps.length > 0 || cuResult ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Monitor className="size-4 text-primary" />
            <h3 className="font-medium text-sm">Full computer control {cuRunning ? "- working" : cuResult ? "- done" : ""}</h3>
          </div>
          <ol className="mt-3 space-y-1.5 text-sm">
            {cuSteps.map((s, i) => (
              <li key={i} className="flex gap-2 text-muted-foreground">
                <span className="shrink-0 font-mono text-xs tabular-nums">{s.step ?? i + 1}.</span>
                <span className={s.error ? "text-destructive" : ""}>
                  {s.error ? `Error: ${s.error}` : s.text || (s.actions?.length ? s.actions.map((a) => a.type).join(", ") : "…")}
                </span>
              </li>
            ))}
          </ol>
          {cuResult ? <p className="mt-3 font-medium text-sm">{cuResult}</p> : null}
          {cuCanContinue && !cuRunning ? (
            <Button type="button" size="sm" className="mt-3" onClick={() => void continueFullComputerControl()}>
              <Play className="size-4" />
              Continue
            </Button>
          ) : null}
        </div>
      ) : null}

      {activeRun ? (
        <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                <Badge>{statusLabel(activeRun)}</Badge>
                <Badge variant="outline">{targetLabel(activeRun.resolution.selectedTarget)}</Badge>
              </div>
                <h3 className="mt-3 font-semibold text-base">{activeRun.taskTitle}</h3>
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
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-5 text-muted-foreground text-sm">
          Nothing running yet. Describe a task above and hit Start - you&apos;ll see its status, controls, and results here.
        </div>
      )}

      <Dialog open={chromeSetupOpen} onOpenChange={setChromeSetupOpen}>
        <DialogContent className="max-w-[520px] sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Turn on Chrome remote debugging</DialogTitle>
            <DialogDescription>
              We need Chrome listening on port 9222 so the agent can drive your real
              browser (with your logins). Two ways to do it.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-4 text-sm">
            <div className="min-w-0">
              <p className="font-medium">1. Open the inspect page in Chrome</p>
              <p className="text-muted-foreground">
                If Chrome shows targets at <code className="break-all">chrome://inspect#remote-debugging</code>,
                you&apos;re already good. If it&apos;s empty, you need to relaunch
                Chrome with the flag below.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() =>
                  desktopBridge()?.openExternal?.("chrome://inspect/#remote-debugging")
                }
              >
                Open chrome://inspect in Chrome
              </Button>
            </div>
            <div className="min-w-0">
              <p className="font-medium">2. Relaunch Chrome with debugging on</p>
              <p className="text-muted-foreground">
                Quit Chrome completely, then run this in Terminal:
              </p>
              <pre className="mt-2 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted px-3 py-2 text-xs">
                {chromeDebugCommand(desktopBridge()?.platform)}
              </pre>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChromeSetupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setChromeSetupOpen(false);
                void runOnMyComputer();
              }}
            >
              Done, try again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
