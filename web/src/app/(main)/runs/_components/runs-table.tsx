"use client";

import { useState } from "react";

import Link from "next/link";

import { ArrowUpDown, Search } from "@/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRuns } from "@/hooks/queries/use-runs";
import type { Run, RunStatus } from "@/types/runs";

import { LiveRunCard } from "./live-run-card";
import { RUN_STATUS_OPTIONS } from "./status-options";
import { StatusPill } from "./status-pill";

const LIVE_STATUSES = new Set<RunStatus>(["pending", "booting", "running", "paused", "paused_by_user", "verifying"]);
const SKELETON_ROWS = ["skeleton-run-1", "skeleton-run-2", "skeleton-run-3", "skeleton-run-4", "skeleton-run-5", "skeleton-run-6"];
const SKELETON_COLUMNS = ["status", "workflow", "target", "started"];

// Friendly labels for executionTarget so the table reads "Cloud" / "Computer
// use" / "Your Chrome" instead of "basics_cloud" / "local_compute" /
// "local_relay" or the legacy hardcoded value.
const TARGET_LABEL: Record<string, string> = {
  cloud: "Cloud",
  basics_cloud: "Cloud",
  computer: "Computer use",
  local_compute: "Computer use",
  chrome: "Your Chrome",
  local_relay: "Your Chrome",
};

export function RunsTable() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RunStatus | "all">("all");
  const [startedDesc, setStartedDesc] = useState(true);

  const { data, isLoading } = useRuns({
    status,
    search: search.trim() || undefined,
  });

  const liveRuns = (data ?? []).filter((run) => LIVE_STATUSES.has(run.status));
  const historyRuns = (data ?? []).filter((run) => !LIVE_STATUSES.has(run.status));
  const sortedHistoryRuns = historyRuns.toSorted((left, right) => {
    const delta = new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime();
    return startedDesc ? -delta : delta;
  });

  const totalCount = (data ?? []).length;

  return (
    <div className="space-y-6">
      {liveRuns.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
            <h2 className="font-semibold text-sm tracking-tight">
              Live now <span className="text-muted-foreground">· {liveRuns.length}</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {liveRuns.map((run) => (
              <LiveRunCard key={run.id} run={run} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-sm tracking-tight">
            History <span className="text-muted-foreground">· {historyRuns.length}</span>
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search runs or workflow…"
                className="h-9 w-64 pl-8"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as RunStatus | "all")}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {RUN_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(search || status !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                    onClick={() => setStartedDesc((current) => !current)}
                    aria-label={`Sort by started time ${startedDesc ? "oldest first" : "newest first"}`}
                  >
                    Started
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                SKELETON_ROWS.map((rowKey) => (
                  <TableRow key={rowKey}>
                    {SKELETON_COLUMNS.map((columnKey) => (
                      <TableCell key={columnKey}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sortedHistoryRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={SKELETON_COLUMNS.length} className="h-32 text-center text-muted-foreground">
                    {totalCount === 0 ? "No runs match these filters." : "All matching runs are still live above."}
                  </TableCell>
                </TableRow>
              ) : (
                sortedHistoryRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <StatusPill status={run.status} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/runs/${run.id}`} className="font-medium hover:underline underline-offset-2" prefetch={false}>
                        {run.workflowName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground/70 text-sm">
                        {TARGET_LABEL[run.executionTarget ?? "cloud"] ?? run.executionTarget ?? "Cloud"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{formatRelative(run.startedAt)}</span>
                        <span className="text-muted-foreground text-xs">{formatDuration(run)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function formatDuration(run: Run): string {
  if (!run.completedAt) return "In progress";
  const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}
