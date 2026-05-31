"use client";

import { useState } from "react";

import {
  Brain,
  CheckCircle2,
  Clock,
  Eye,
  FileSearch,
  Lock,
  Pause,
  Play,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
} from "@/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalContextActions, useLocalContextStore, usePrivacyBoundary } from "@/hooks/queries/use-local-context";
import type { AgentContextResult, LocalContextStore } from "@/types/local-context";

const AGENT_QUERY = "What approved local context can help with invoice and revenue automations?";

const DATE_FORMATTER = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function ContextConsole() {
  const { data: store, isLoading, isError, refetch } = useLocalContextStore();
  const actions = useLocalContextActions();
  const privacy = usePrivacyBoundary(store);
  const [lastAgentResult, setLastAgentResult] = useState<AgentContextResult | null>(null);
  const [lastSweepCount, setLastSweepCount] = useState<number | null>(null);

  if (isLoading) {
    return <ContextSkeleton />;
  }

  if (isError || !store || !privacy) {
    return (
      <main className="space-y-4">
        <Header />
        <div className="rounded-lg border bg-card p-6">
          <h2 className="font-semibold text-base">Local context store unavailable</h2>
          <p className="mt-1 text-muted-foreground text-sm">The local Lens state could not be read. Retry loads the local-only store again.</p>
          <Button type="button" className="mt-4" onClick={() => void refetch()}>
            <RefreshCcw className="size-4" />
            Retry
          </Button>
        </div>
      </main>
    );
  }

  const approvedCount = privacy.approvedSummaries;
  const pendingCount = store.summaries.filter((summary) => summary.approval.status === "pending").length;
  const rawSizeMb = store.rawPointers.reduce((total, pointer) => total + pointer.byteSize, 0) / 1_000_000;
  const isRunning = store.status.status === "running";

  const runAgentQuery = async () => {
    const result = await actions.queryAgentContext.mutateAsync(AGENT_QUERY);
    setLastAgentResult(result);
  };

  const sweepRetention = async () => {
    const result = await actions.sweepRetention.mutateAsync();
    setLastSweepCount(result.deletedCount);
  };

  return (
    <main className="space-y-5">
      <Header />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Eye} label="Lens" value={labelForStatus(store.status.status)} detail="Watching your screen on this device" tone={isRunning ? "good" : "warn"} />
        <Metric icon={Lock} label="On this device" value={`${store.rawPointers.length} items`} detail={`${rawSizeMb.toFixed(1)} MB`} />
        <Metric icon={Brain} label="Summaries" value={`${approvedCount} approved`} detail={`${pendingCount} waiting`} />
        <Metric icon={ShieldCheck} label="Agent access" value="Summaries only" detail="Never sees raw data" tone="good" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-semibold text-base">Local capture controls</h2>
              <p className="text-muted-foreground text-sm">Pause capture, choose how long data is kept, and see what stays private.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isRunning ? (
                <Button type="button" variant="outline" onClick={() => actions.pause.mutate()}>
                  <Pause className="size-4" />
                  Pause
                </Button>
              ) : (
                <Button type="button" onClick={() => actions.resume.mutate()}>
                  <Play className="size-4" />
                  Resume
                </Button>
              )}
              <Button type="button" variant="outline" onClick={sweepRetention}>
                <Trash2 className="size-4" />
                Sweep retention
              </Button>
            </div>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <InfoBlock label="Storage" value={store.status.storageRoot} detail="Screen images, text, audio, and activity history all stay here." />
            <div className="space-y-2">
              <span className="text-sm font-medium">Retention</span>
              <NativeSelect
                value={store.status.retentionDays.toString()}
                onChange={(event) => actions.setRetention.mutate(Number(event.target.value))}
                className="w-full"
              >
                <NativeSelectOption value="7">7 days</NativeSelectOption>
                <NativeSelectOption value="30">30 days</NativeSelectOption>
                <NativeSelectOption value="90">90 days</NativeSelectOption>
              </NativeSelect>
              <p className="text-muted-foreground text-xs">Next sweep {formatRelative(store.status.nextRetentionSweepAt)}</p>
            </div>
            <InfoBlock
              label="Cloud boundary"
              value={store.status.rawUploadEnabled ? "Raw upload on" : "Raw upload off"}
              detail="Only summaries you approve can leave. Raw data stays on this device."
            />
          </div>
          {lastSweepCount !== null ? (
            <div className="border-t px-4 py-3 text-muted-foreground text-sm">
              Last retention sweep removed {lastSweepCount} expired local record{lastSweepCount === 1 ? "" : "s"}.
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold text-base">Privacy boundary</h2>
          <div className="mt-3 space-y-3">
            <BoundaryRow label="Raw data is never uploaded" ok={!privacy.rawUploadEnabled} />
            <BoundaryRow label="Raw data stays on this device" ok={privacy.rawPointersLocalOnly} />
            <BoundaryRow label="Your agent can't read raw data" ok={!privacy.agentQueryReturnsRaw} />
            <BoundaryRow label="Never used for training" ok />
          </div>
        </div>
      </section>

      <Tabs defaultValue="raw" className="space-y-3">
        <TabsList>
          <TabsTrigger value="raw">On this device</TabsTrigger>
          <TabsTrigger value="summaries">Summaries</TabsTrigger>
          <TabsTrigger value="agent">Agent access</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="raw">
          <RawTable store={store} />
        </TabsContent>

        <TabsContent value="summaries">
          <SummaryTable store={store} approve={(id) => actions.approve.mutate(id)} />
        </TabsContent>

        <TabsContent value="agent">
          <AgentQueryPanel store={store} result={lastAgentResult} runAgentQuery={runAgentQuery} isPending={actions.queryAgentContext.isPending} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTable store={store} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Header() {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Context</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
          What Basics remembers from your activity on this device, the summaries your agent is
          allowed to use, and the privacy rules that keep the raw data on your computer.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Private by default</Badge>
        <Badge variant="outline">Stays on this device</Badge>
      </div>
    </header>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const badgeVariant = tone === "warn" ? "secondary" : tone === "good" ? "default" : "outline";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p className="mt-1 font-semibold text-base">{value}</p>
            <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
          </div>
        </div>
        <Badge variant={badgeVariant}>{tone}</Badge>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 break-words font-medium text-sm">{value}</p>
      <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
    </div>
  );
}

function BoundaryRow({ label, ok }: { label: string; ok: boolean }) {
  const good = ok;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
      <span className="text-sm">{label}</span>
      <Badge variant={good ? "default" : "destructive"}>{good ? "Pass" : "Check"}</Badge>
    </div>
  );
}

function RawTable({ store }: { store: LocalContextStore }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <h2 className="font-semibold text-base">What's stored on this device</h2>
        <p className="text-muted-foreground text-sm">A list of what exists on your computer. It never shows the actual screen images, text, audio, or what you typed.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kind</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Privacy</TableHead>
            <TableHead>Retained until</TableHead>
            <TableHead>Local ref</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {store.rawPointers.map((pointer) => (
            <TableRow key={pointer.id}>
              <TableCell>{pointer.kind}</TableCell>
              <TableCell>
                <div className="min-w-0">
                  <p className="font-medium">{pointer.sourceApp}</p>
                  <p className="max-w-[220px] truncate text-muted-foreground text-xs">{pointer.windowTitle}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{pointer.privacyClass}</Badge>
              </TableCell>
              <TableCell>{formatDate(pointer.retainedUntil)}</TableCell>
              <TableCell>
                <span className="block max-w-[320px] truncate text-muted-foreground text-xs">{pointer.localPath}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryTable({ store, approve }: { store: LocalContextStore; approve: (id: string) => void }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <h2 className="font-semibold text-base">Distilled summaries</h2>
        <p className="text-muted-foreground text-sm">Only approved distilled rows are available to agents or cloud workflows.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Summary</TableHead>
            <TableHead>Apps</TableHead>
            <TableHead>Approval</TableHead>
            <TableHead>Upload</TableHead>
            <TableHead className="w-[120px]">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {store.summaries.map((summary) => (
            <TableRow key={summary.id}>
              <TableCell>
                <div className="min-w-0">
                  <p className="font-medium">{summary.title}</p>
                  <p className="max-w-[460px] whitespace-normal text-muted-foreground text-xs">{summary.summary}</p>
                </div>
              </TableCell>
              <TableCell>{summary.sourceApps.join(", ")}</TableCell>
              <TableCell>
                <Badge variant={summary.approval.status === "approved" ? "default" : "secondary"}>{summary.approval.status}</Badge>
              </TableCell>
              <TableCell>{summary.uploadState}</TableCell>
              <TableCell>
                {summary.approval.status === "pending" ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => approve(summary.id)}>
                    Approve
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-xs">No action</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AgentQueryPanel({
  store,
  result,
  runAgentQuery,
  isPending,
}: {
  store: LocalContextStore;
  result: AgentContextResult | null;
  runAgentQuery: () => Promise<void>;
  isPending: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <Search className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-semibold text-base">Approved context query</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              This models the local agent API. It returns approved distilled summaries, never raw local pointers.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border bg-muted/20 p-3 text-sm">{AGENT_QUERY}</div>
        <Button type="button" className="mt-4" onClick={() => void runAgentQuery()} disabled={isPending}>
          <FileSearch className="size-4" />
          Query approved context
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="font-semibold text-base">Result</h2>
        {result ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge>{result.privacyClass}</Badge>
              <Badge variant="outline">raw returned: {result.rawItemsReturned}</Badge>
              <Badge variant="outline">{result.summaries.length} summaries</Badge>
            </div>
            {result.summaries.map((summary) => (
              <div key={summary.id} className="rounded-lg border bg-muted/20 p-3">
                <p className="font-medium text-sm">{summary.title}</p>
                <p className="mt-1 text-muted-foreground text-sm">{summary.summary}</p>
                {summary.automationCandidate ? <p className="mt-2 text-primary text-sm">{summary.automationCandidate}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-lg border bg-muted/20 p-4 text-muted-foreground text-sm">
            No query run yet. {store.summaries.filter((summary) => summary.approval.status !== "approved").length} non-approved summaries are blocked.
          </div>
        )}
      </div>
    </div>
  );
}

function AuditTable({ store }: { store: LocalContextStore }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b p-4">
        <h2 className="font-semibold text-base">Context audit log</h2>
        <p className="text-muted-foreground text-sm">Local action log envelope for capture, approvals, retention, and agent context queries.</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Privacy</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {store.auditEvents.map((event) => (
            <TableRow key={event.id}>
              <TableCell>{event.eventType}</TableCell>
              <TableCell>{event.source}</TableCell>
              <TableCell>
                <Badge variant="outline">{event.privacyClass}</Badge>
              </TableCell>
              <TableCell>
                <span className="block max-w-[220px] truncate text-muted-foreground text-xs">{event.deviceId}</span>
              </TableCell>
              <TableCell>{formatRelative(event.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ContextSkeleton() {
  return (
    <main className="space-y-5">
      <Header />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-[420px]" />
    </main>
  );
}

function labelForStatus(status: LocalContextStore["status"]["status"]): string {
  if (status === "running") return "Running";
  if (status === "paused") return "Paused";
  if (status === "blocked") return "Blocked";
  return "Error";
}

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value));
}

function formatRelative(value: string): string {
  const deltaMs = new Date(value).getTime() - Date.now();
  const absMinutes = Math.max(1, Math.round(Math.abs(deltaMs) / 60_000));
  if (deltaMs >= 0) return `in ${absMinutes}m`;
  return `${absMinutes}m ago`;
}
