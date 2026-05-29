"use client";

import { useState } from "react";

import Link from "next/link";

import { BadgeCheck, FileSearch, Monitor, Search, ShieldCheck, ThumbsDown, ThumbsUp, TriangleAlertIcon } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildReplayTrace, validatePlatformEvent } from "@/lib/platform-events-runtime";
import { cn } from "@/lib/utils";
import { usePlatformEventActions, usePlatformEvents } from "@/hooks/queries/use-platform-events";
import type {
  PlatformEvent,
  PlatformEventFilters,
  PlatformEventSource,
  PlatformFeedbackLabel,
  PlatformPrivacyClass,
  TrainingConsentMode,
} from "@/types/platform-events";

const FEEDBACK_LABELS: Array<{ label: PlatformFeedbackLabel; text: string; icon: typeof ThumbsUp }> = [
  { label: "success", text: "Success", icon: ThumbsUp },
  { label: "bad_action", text: "Bad action", icon: ThumbsDown },
  { label: "wrong_context", text: "Wrong context", icon: TriangleAlertIcon },
  { label: "too_risky", text: "Too risky", icon: ShieldCheck },
  { label: "needs_review", text: "Needs review", icon: FileSearch },
];

export function LogsConsole() {
  const [filters, setFilters] = useState<PlatformEventFilters>({
    source: "all",
    privacyClass: "all",
    objectType: "all",
    deviceId: "all",
    feedback: "all",
  });
  const { data, isLoading } = usePlatformEvents(filters);
  const actions = usePlatformEventActions();
  const logs = data.events;
  const allEvents = data.allEvents;
  const summary = data.summary;
  const store = data.store;
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>();
  const selectedEvent = allEvents.find((event) => event.id === selectedEventId) ?? logs[0];
  const replay = selectedEvent && store ? buildReplayTrace(selectedEvent, allEvents, store) : undefined;
  const deviceOptions = Array.from(
    new Set(allEvents.flatMap((event) => (event.device_id ? [event.device_id] : []))),
  ).sort();

  const updateFilter = <K extends keyof PlatformEventFilters>(key: K, value: PlatformEventFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Logs/Audit</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            Unified local, cloud, app, approval, and Lens events with privacy class, actor, device, object pointers, replay, cost, and feedback labels.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Unified envelope</Badge>
          <Badge variant="outline">Replay-ready</Badge>
          <Badge variant="outline">Raw local excluded</Badge>
          <Badge variant="outline">Training upload off</Badge>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Events" value={summary.total.toString()} detail="All normalized event envelopes in this profile." />
        <Metric label="Replay links" value={summary.replayReady.toString()} detail="Runs, automations, apps, approvals, or replay refs." />
        <Metric label="Invalid" value={summary.invalid.toString()} detail="Envelope validation errors found." />
        <Metric label="Training export" value={summary.trainingExport.event_count.toString()} detail={`${summary.trainingExport.mode}; upload disabled.`} />
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="logs-filter-search"
              className="pl-8"
              placeholder="Search events, ids, actors, payload refs"
              value={filters.search ?? ""}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
          </div>
          <NativeSelect
            data-testid="logs-filter-source"
            value={filters.source ?? "all"}
            onChange={(event) => updateFilter("source", event.target.value as PlatformEventSource | "all")}
          >
            <NativeSelectOption value="all">All sources</NativeSelectOption>
            <NativeSelectOption value="client">Client</NativeSelectOption>
            <NativeSelectOption value="lens">Lens</NativeSelectOption>
            <NativeSelectOption value="agent">Agent</NativeSelectOption>
            <NativeSelectOption value="cloud">Cloud</NativeSelectOption>
            <NativeSelectOption value="app">Apps</NativeSelectOption>
            <NativeSelectOption value="cli">CLI</NativeSelectOption>
            <NativeSelectOption value="approval">Approvals</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            data-testid="logs-filter-object"
            value={filters.objectType ?? "all"}
            onChange={(event) => updateFilter("objectType", event.target.value as PlatformEventFilters["objectType"])}
          >
            <NativeSelectOption value="all">All objects</NativeSelectOption>
            <NativeSelectOption value="run">Runs</NativeSelectOption>
            <NativeSelectOption value="app">Apps</NativeSelectOption>
            <NativeSelectOption value="automation">Automations</NativeSelectOption>
            <NativeSelectOption value="approval">Approvals</NativeSelectOption>
            <NativeSelectOption value="device">Devices</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            data-testid="logs-filter-privacy"
            value={filters.privacyClass ?? "all"}
            onChange={(event) => updateFilter("privacyClass", event.target.value as PlatformPrivacyClass | "all")}
          >
            <NativeSelectOption value="all">All privacy</NativeSelectOption>
            <NativeSelectOption value="action_log">Action log</NativeSelectOption>
            <NativeSelectOption value="distilled_cloud">Distilled cloud</NativeSelectOption>
            <NativeSelectOption value="raw_local">Raw local</NativeSelectOption>
            <NativeSelectOption value="training_allowed">Training allowed</NativeSelectOption>
            <NativeSelectOption value="training_denied">Training denied</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            data-testid="logs-filter-device"
            value={filters.deviceId ?? "all"}
            onChange={(event) => updateFilter("deviceId", event.target.value)}
          >
            <NativeSelectOption value="all">All devices</NativeSelectOption>
            {deviceOptions.map((deviceId) => (
              <NativeSelectOption key={deviceId} value={deviceId}>{deviceId}</NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            data-testid="logs-filter-feedback"
            value={filters.feedback ?? "all"}
            onChange={(event) => updateFilter("feedback", event.target.value as PlatformEventFilters["feedback"])}
          >
            <NativeSelectOption value="all">All feedback</NativeSelectOption>
            <NativeSelectOption value="unlabeled">Unlabeled</NativeSelectOption>
            {FEEDBACK_LABELS.map((item) => (
              <NativeSelectOption key={item.label} value={item.label}>{item.text}</NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            data-testid="logs-training-mode"
            value={store?.trainingConsent.mode ?? "disabled"}
            onChange={(event) => actions.setTrainingMode.mutate(event.target.value as TrainingConsentMode)}
          >
            <NativeSelectOption value="disabled">Training disabled</NativeSelectOption>
            <NativeSelectOption value="evals_only">Evals only</NativeSelectOption>
            <NativeSelectOption value="workflow_learning">Workflow learning</NativeSelectOption>
            <NativeSelectOption value="org_model_training">Org model training</NativeSelectOption>
          </NativeSelect>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-semibold text-base">Platform event stream</h2>
              <p className="text-muted-foreground text-sm">Filter by app, automation, approval, device, source, privacy class, and feedback.</p>
            </div>
            <Badge variant="secondary">{logs.length} visible</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Object</TableHead>
                <TableHead>Privacy</TableHead>
                <TableHead>Feedback</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 8 }).map((_cell, cellIndex) => (
                      <TableCell key={cellIndex}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <FileSearch className="mx-auto mb-2 size-6 opacity-50" />
                    No events match these filters.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    selected={event.id === selectedEvent?.id}
                    onInspect={() => setSelectedEventId(event.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <EventDetail
          event={selectedEvent}
          allEvents={allEvents}
          replay={replay}
          onFeedback={(eventId, feedback) => actions.label.mutate({ eventId, feedback })}
        />
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <Monitor className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="font-semibold text-base">Log contract</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Every event carries workspace, actor, source, privacy class, target, status, and created timestamp. Raw Lens payloads stay local and are represented by local refs only. Training exports are previews until a workspace explicitly opts in and still exclude raw capture.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function EventRow({ event, selected, onInspect }: { event: PlatformEvent; selected: boolean; onInspect: () => void }) {
  const validation = validatePlatformEvent(event);
  return (
    <TableRow data-testid={`logs-event-row-${event.id}`} className={cn(selected && "bg-muted/60")}>
      <TableCell>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{event.event_type}</span>
            <Badge variant={validation.ok ? "outline" : "destructive"}>{event.status}</Badge>
          </div>
          <div className="max-w-[310px] truncate font-mono text-muted-foreground text-[11px]">{event.id}</div>
          {event.payload_ref ? <div className="max-w-[310px] truncate text-muted-foreground text-xs">ref:{event.payload_ref}</div> : null}
        </div>
      </TableCell>
      <TableCell>
        <Link href={objectHref(event)} prefetch={false} className="font-mono text-xs hover:underline">
          {objectLabel(event)}
        </Link>
        <div className="mt-1 text-muted-foreground text-[11px]">{event.source} · {event.actor_account_id}</div>
      </TableCell>
      <TableCell>
        <Badge variant={event.privacy_class === "raw_local" ? "destructive" : event.privacy_class === "distilled_cloud" ? "secondary" : "outline"}>
          {event.privacy_class}
        </Badge>
        <div className="mt-1 text-muted-foreground text-[11px]">{event.redaction_state}</div>
      </TableCell>
      <TableCell>
        {event.feedback ? (
          <BadgeCheck className="mr-1 inline size-3.5 text-emerald-600" />
        ) : null}
        <span className="text-xs">{event.feedback?.label ?? "Unlabeled"}</span>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{event.target}</Badge>
        <div className="mt-1 text-muted-foreground text-[11px]">{event.runtime ?? "runtime n/a"}</div>
      </TableCell>
      <TableCell className="font-mono text-xs">{formatCost(event)}</TableCell>
      <TableCell className="text-muted-foreground text-xs">
        <time dateTime={event.created_at} title={event.created_at} className="block whitespace-nowrap">
          {formatRelative(event.created_at)}
        </time>
        <span className="block whitespace-nowrap font-mono text-[11px]">{event.created_at}</span>
      </TableCell>
      <TableCell>
        <Button type="button" size="sm" variant="outline" onClick={onInspect}>
          Inspect
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EventDetail({
  event,
  allEvents,
  replay,
  onFeedback,
}: {
  event: PlatformEvent | undefined;
  allEvents: PlatformEvent[];
  replay: ReturnType<typeof buildReplayTrace> | undefined;
  onFeedback: (eventId: string, feedback: PlatformFeedbackLabel) => void;
}) {
  if (!event) {
    return (
      <aside className="rounded-lg border bg-card p-5 text-center text-muted-foreground text-sm">
        Select an event to inspect its envelope, replay links, feedback, and export eligibility.
      </aside>
    );
  }

  const validation = validatePlatformEvent(event);
  const relatedCount = replay?.events.length ?? 0;
  const sampleJson = JSON.stringify(event, null, 2);

  return (
    <aside data-testid="logs-detail-panel" className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-base">{event.event_type}</h2>
            <p className="truncate font-mono text-muted-foreground text-xs">{event.id}</p>
          </div>
          <Badge variant={validation.ok ? "outline" : "destructive"}>{validation.ok ? "Valid" : "Invalid"}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Detail label="Source" value={event.source} />
          <Detail label="Privacy" value={event.privacy_class} />
          <Detail label="Status" value={event.status} />
          <Detail label="Device" value={event.device_id ?? "-"} />
          <Detail label="Object" value={objectLabel(event)} />
          <Detail label="Replay" value={replay?.replayable ? "ready" : "metadata only"} />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium text-sm">Feedback label</h3>
        <div className="grid grid-cols-2 gap-2">
          {FEEDBACK_LABELS.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.label}
                type="button"
                size="sm"
                variant={event.feedback?.label === item.label ? "default" : "outline"}
                data-testid={`logs-feedback-${item.label}`}
                onClick={() => onFeedback(event.id, item.label)}
              >
                <Icon className="size-3.5" />
                {item.text}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-sm">Replay detail</h3>
          <Badge variant="secondary">{relatedCount} events</Badge>
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          {replay?.replayable ? "Enough detail was captured to replay this run or learn from it." : "Not enough detail was captured to replay this yet."}
        </p>
        <div className="mt-2 text-muted-foreground text-xs">
          {replay?.training_export_preview.event_count ?? 0} events captured. Nothing is uploaded, and raw screen data is never included.
        </div>
      </div>

      {!validation.ok || validation.warnings.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 text-xs dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {[...validation.errors, ...validation.warnings].join(" ")}
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 font-medium text-sm">Envelope JSON</h3>
        <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">{sampleJson}</pre>
      </div>

      <div className="text-muted-foreground text-[11px]">
        Inspecting {allEvents.length} total events. Links and labels are stored locally until backend event APIs replace this store.
      </div>
    </aside>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="truncate font-mono text-xs">{value}</div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-2 font-semibold text-lg">{value}</div>
      <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
    </div>
  );
}

function objectHref(event: PlatformEvent): string {
  if (event.approval_id) return `/approvals/${event.approval_id}`;
  if (event.automation_id) return `/automations/${event.automation_id}`;
  if (event.app_id) return "/apps";
  if (event.run_id) return `/runs/${event.run_id}`;
  return "/context";
}

function objectLabel(event: PlatformEvent): string {
  return event.approval_id ?? event.automation_id ?? event.app_id ?? event.run_id ?? event.device_id ?? event.payload_ref ?? event.id;
}

function formatCost(event: PlatformEvent): string {
  if (!event.cost) return "-";
  const parts = [
    event.cost.api_credits_cents ? `${event.cost.api_credits_cents}c` : "",
    event.cost.model_tokens ? `${event.cost.model_tokens}tok` : "",
    event.cost.browser_minutes ? `${event.cost.browser_minutes}m` : "",
    event.cost.worker_seconds ? `${event.cost.worker_seconds}s` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

function formatRelative(value: string): string {
  const deltaMs = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.max(1, Math.round(deltaMs / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
