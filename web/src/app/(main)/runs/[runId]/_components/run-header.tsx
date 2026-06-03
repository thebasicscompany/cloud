"use client";

import Link from "next/link";

import { ChevronRight, Maximize2, Pause, Play, RefreshCcw } from "@/icons";

import { Button } from "@/components/ui/button";
import type { Run } from "@/types/runs";

import { StatusPill } from "../../_components/status-pill";

const LIVE_STATUSES = new Set(["pending", "booting", "running", "paused", "paused_by_user", "verifying"]);

// Friendly labels for the executionTarget enum the API surfaces. Raw values
// (basics_cloud / local_compute / cloud / chrome) leak implementation detail
// into the UI; users care about "where did this run?", not the slug.
const TARGET_LABEL: Record<string, string> = {
  cloud: "Cloud",
  basics_cloud: "Cloud", // legacy hardcoded value still in old run rows
  computer: "Computer use",
  local_compute: "Computer use", // legacy
  chrome: "Your Chrome",
  local_relay: "Your Chrome", // legacy
};

type Props = {
  run: Run;
  takeover: boolean;
  onToggleTakeover: () => void;
  paused: boolean;
  onTogglePause: () => void;
};

export function RunHeader({ run, takeover, onToggleTakeover, paused, onTogglePause }: Props) {
  const isLive = LIVE_STATUSES.has(run.status);

  return (
    <header className="space-y-3">
      <nav className="flex items-center gap-1 text-muted-foreground text-sm">
        <Link href="/runs" prefetch={false} className="hover:text-foreground">
          Runs
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-foreground">{run.workflowName}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-semibold text-2xl tracking-tight">{run.workflowName}</h1>
            <StatusPill status={run.status} />
            {run.executionTarget ? (
              <span className="inline-flex items-center rounded-full border bg-card px-2 py-0.5 text-foreground/70 text-xs">
                {TARGET_LABEL[run.executionTarget] ?? run.executionTarget}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isLive ? (
            <>
              <Button size="sm" variant="outline" onClick={onTogglePause} className="gap-1.5">
                {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {paused ? "Resume" : "Pause"}
              </Button>
              <Button
                size="sm"
                variant={takeover ? "default" : "outline"}
                onClick={onToggleTakeover}
                className="gap-1.5"
              >
                <Maximize2 className="size-3.5" />
                {takeover ? "Exit take-over" : "Take over"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5">
              <RefreshCcw className="size-3.5" />
              Re-run
            </Button>
          )}
        </div>
      </div>

      {/* User-friendly metadata strip — only what the user actually cares
       *  about. Removed: raw run UUID, Steps:0 noise, Trigger:Manual (the
       *  default), Runtime:live (always live in the UI), Actor UUID,
       *  Session UUID, raw Target slug. Kept: Started + Duration + Cost
       *  when present. Error summary stays below as-is. */}
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-foreground/70">
        <Stat label="Started" value={formatRelative(run.startedAt)} />
        <Stat label="Duration" value={formatDuration(run, isLive)} />
        {run.costCents != null && run.costCents > 0 && (
          <Stat label="Cost" value={`$${(run.costCents / 100).toFixed(2)}`} />
        )}
      </dl>

      {run.errorSummary && (
        <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-red-700 text-sm dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {run.errorSummary}
        </div>
      )}
    </header>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : "font-medium tabular-nums"}>{value}</dd>
    </div>
  );
}

function triggerText(run: Run): string {
  const cap = run.trigger.charAt(0).toUpperCase() + run.trigger.slice(1);
  return run.triggeredBy ? `${cap} · ${run.triggeredBy.name}` : cap;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function formatDuration(run: Run, isLive: boolean): string {
  if (!run.completedAt) {
    if (isLive) {
      const ms = Date.now() - new Date(run.startedAt).getTime();
      return `${formatMs(ms)} elapsed`;
    }
    return "—";
  }
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  return formatMs(ms);
}

function formatMs(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}
