"use client";

import Link from "next/link";
import { useState } from "react";

import { FileSearch, Monitor } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRuns } from "@/hooks/queries/use-runs";
import { cn } from "@/lib/utils";
import type { Run, RunStatus } from "@/types/runs";

const LIVE_STATUSES = new Set<RunStatus>([
  "pending",
  "booting",
  "running",
  "paused",
  "paused_by_user",
  "verifying",
]);

// Ambient pill, shown ONLY while a real cloud run is live (matches the demo:
// the pill = "agent working"). It tracks the most recent live run and always
// links to a run that exists, so "Open run" never 404s.
export function AgentOverlayPill() {
  const { data: runs } = useRuns({});
  const [expanded, setExpanded] = useState(false);

  const current = (runs ?? []).find((r) => LIVE_STATUSES.has(r.status)) ?? null;
  if (!current) return null;

  return (
    <aside className="fixed right-4 bottom-4 z-50 w-[min(360px,calc(100vw-2rem))]">
      <div className="rounded-lg border bg-background/95 shadow-lg backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-sm">{current.workflowName}</div>
              <div className="truncate text-muted-foreground text-xs">
                {statusLabel(current.status)} · {runtimeLabel(current)}
              </div>
            </div>
          </div>
          <Badge className="h-auto min-h-5 shrink-0 py-0.5">{statusLabel(current.status)}</Badge>
        </button>

        {expanded ? (
          <div className="space-y-3 border-t p-3">
            <div className="grid grid-cols-2 gap-2">
              <PillFact label="run" value={current.id.slice(0, 12)} />
              <PillFact label="runtime" value={runtimeLabel(current)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href={`/runs/${current.id}`} prefetch={false}>
                  <Monitor className="size-4" />
                  Open run
                </Link>
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href="/logs" prefetch={false}>
                  <FileSearch className="size-4" />
                  Logs
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function PillFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 px-2 py-1.5">
      <div className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</div>
      <div className="truncate font-mono text-xs">{value}</div>
    </div>
  );
}

function statusLabel(status: RunStatus): string {
  if (status === "paused" || status === "paused_by_user") return "Paused";
  if (status === "stopped") return "Stopped";
  if (status === "completed" || status === "verified") return "Complete";
  if (status === "failed" || status === "unverified") return "Failed";
  if (status === "verifying") return "Verifying";
  if (status === "booting" || status === "pending") return "Starting";
  return "Running";
}

function runtimeLabel(run: Run): string {
  return (run.runtime ?? "cloud").replace("basics_", "").replaceAll("_", " ");
}
