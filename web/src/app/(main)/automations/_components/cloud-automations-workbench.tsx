"use client";

import Link from "next/link";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";

import {
  CalendarClock,
  ChevronRight,
  Clock,
  FileSearch,
  Globe,
  KeyRound,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  Wrench,
} from "@/icons";

import { StatusPill } from "@/app/(main)/runs/_components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCloudAutomation, useCloudAutomationActions, useCloudAutomations } from "@/hooks/queries/use-cloud-automations";
import { formatCron, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CloudAutomation, CloudAutomationRun, CloudAutomationSummary, CloudAutomationTrigger, CloudTrustGrant } from "@/types/cloud-automation";
import type { RunStatus } from "@/types/runs";

export function CloudAutomationsWorkbench() {
  const { data: automations, isLoading } = useCloudAutomations();
  const actions = useCloudAutomationActions();

  const active = (automations ?? []).filter((automation) => automation.status === "active");
  const scheduled = (automations ?? []).filter((automation) => automation.triggers.some((t) => t.type === "schedule"));
  const runs7d = (automations ?? []).reduce((sum, automation) => sum + automation.runsLast7d, 0);

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            Saved agent jobs — each runs a goal on a schedule or a Composio webhook trigger, in Basics Cloud, with every
            run inspectable in Runs and Logs. Ask basichome to set one up.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric icon={Wrench} label="Saved" value={(automations ?? []).length.toString()} detail={`${active.length} active`} />
        <Metric icon={CalendarClock} label="Scheduled" value={scheduled.length.toString()} detail="Have a cron or webhook trigger." />
        <Metric icon={Clock} label="Runs (7d)" value={runs7d.toString()} detail="Cloud runs across all automations." />
        <Metric icon={Globe} label="Runtime" value="Basics Cloud" detail="Fargate worker · Browserbase live view." />
      </section>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : (automations ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-muted-foreground text-sm">
          No automations yet. Ask basichome to do something repeatable, then save it as an automation.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(automations ?? []).map((automation) => (
            <AutomationCard key={automation.id} automation={automation} />
          ))}
        </div>
      )}
    </main>
  );
}

export function CloudAutomationDetail({ id }: { id: string }) {
  const { data, isLoading } = useCloudAutomation(id);
  const actions = useCloudAutomationActions();
  const automation = data?.automation;
  const runs = data?.runs ?? [];
  const latestRun = runs[0];
  const schedule = automation?.triggers.find((trigger): trigger is Extract<CloudAutomationTrigger, { type: "schedule" }> => trigger.type === "schedule");
  const [cronDraft, setCron] = useState<string | null>(null);
  const [timezoneDraft, setTimezone] = useState<string | null>(null);
  const cron = cronDraft ?? schedule?.cron ?? "0 18 * * 1-5";
  const timezone = timezoneDraft ?? schedule?.timezone ?? "America/New_York";

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <h2 className="font-semibold text-lg">Automation not found</h2>
        <Button asChild variant="outline">
          <Link href="/automations" prefetch={false}>Back to automations</Link>
        </Button>
      </div>
    );
  }

  const activeTrust = automation.trustGrants.filter((grant) => grant.status === "active");

  return (
    <main className="space-y-6">
      <header className="space-y-3">
        <nav className="flex items-center gap-1 text-muted-foreground text-sm">
          <Link href="/automations" prefetch={false} className="hover:text-foreground">Automations</Link>
          <ChevronRight className="size-3.5" />
          <span className="truncate text-foreground">{automation.name}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{automation.name}</h1>
              <AutomationStatus status={automation.status} />
              <TrustBadge automation={automation} />
            </div>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">{automation.description}</p>
          </div>
          <ActionStrip automation={automation} latestRun={latestRun} />
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric icon={CalendarClock} label="Schedule" value={schedule ? formatCron(schedule.cron) : "Manual"} detail={schedule ? schedule.timezone : "No registered cron"} />
        <Metric icon={ShieldCheck} label="Trust grants" value={activeTrust.length.toString()} detail={automation.approvalPolicy.mode.replaceAll("_", " ")} />
        <Metric icon={Globe} label="Runtime" value="Basics Cloud" detail="SQS, Fargate worker, Browserbase live view." />
        <Metric icon={FileSearch} label="Runs" value={runs.length.toString()} detail="Cloud runs recorded for this automation." />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-6">
          <Panel title="Automation goal" description="The execution prompt passed through the cloud worker wrapper.">
            <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">{automation.goal}</div>
          </Panel>

          <Panel title="Runs" description="Every manual, scheduled, and webhook run for this automation. Open one for the full timeline.">
            <RunsTable runs={runs} />
          </Panel>

          {latestRun && latestRun.events.length > 0 ? (
            <Panel title="Latest worker timeline" description="Live worker events for the most recent run.">
              <LatestRunDetails run={latestRun} />
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Panel title="Schedule" description="New automations should use automations[].triggers[].type='schedule'.">
            <div className="space-y-3">
              <label htmlFor="automation-schedule-cron" className="space-y-1.5 text-sm">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Cron</span>
                <Input id="automation-schedule-cron" value={cron} onChange={(event) => setCron(event.target.value)} />
              </label>
              <label htmlFor="automation-schedule-timezone" className="space-y-1.5 text-sm">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">Timezone</span>
                <Input id="automation-schedule-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
              </label>
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => actions.updateSchedule.mutate({ automationId: automation.id, cron, timezone })}
                disabled={actions.updateSchedule.isPending}
              >
                <CalendarClock className="size-4" />
                Save schedule
              </Button>
            </div>
          </Panel>

          <Panel title="Triggers" description="Registered cloud entry points.">
            <div className="space-y-2">
              {automation.triggers.map((trigger) => (
                <TriggerRow key={trigger.id} trigger={trigger} />
              ))}
            </div>
          </Panel>

          <Panel title="Credentials" description="Credentials required by the cloud worker.">
            <div className="flex flex-wrap gap-1.5">
              {automation.requiredCredentials.map((credential) => (
                <Badge key={credential} variant="secondary" className="h-auto min-h-5 py-0.5">
                  <KeyRound data-icon="inline-start" />
                  {credentialLabel(credential)}
                </Badge>
              ))}
            </div>
          </Panel>

          <Panel title="Trust grants" description="Approval remember decisions scoped narrowly to this automation.">
            <div className="space-y-2">
              {automation.trustGrants.map((grant) => (
                <TrustGrantRow key={grant.id} grant={grant} />
              ))}
            </div>
          </Panel>
        </aside>
      </section>
    </main>
  );
}

function AutomationCard({ automation }: { automation: CloudAutomationSummary }) {
  const actions = useCloudAutomationActions();
  const successPct = automation.successRate == null ? null : Math.round(automation.successRate * 100);

  return (
    <section className={cn("rounded-lg border bg-card p-4 transition-colors", automation.status === "paused" && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/automations/${automation.id}`} prefetch={false} className="truncate font-semibold text-base hover:underline underline-offset-2">
              {automation.name}
            </Link>
            <AutomationStatus status={automation.status} />
            <TrustBadge automation={automation} />
          </div>
          <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{automation.description}</p>
        </div>
        <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${automation.name}`}>
          <Link href={`/automations/${automation.id}`} prefetch={false}>
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-sm">
        <MiniStat label="Success" value={successPct == null ? "-" : `${successPct}%`} />
        <MiniStat label="Runs 7d" value={automation.runsLast7d.toString()} />
        <MiniStat label="Trigger" value={triggerLabel(automation)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => actions.runNow.mutate(automation.id)} disabled={actions.runNow.isPending}>
          <Play className="size-3.5" />
          Run now
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => actions.triggerSchedule.mutate(automation.id)} disabled={actions.triggerSchedule.isPending}>
          <CalendarClock className="size-3.5" />
          Trigger schedule
        </Button>
        {automation.status === "paused" ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => actions.resume.mutate(automation.id)} disabled={actions.resume.isPending}>
            <Play className="size-3.5" />
            Resume
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => actions.pause.mutate(automation.id)} disabled={actions.pause.isPending}>
            <Pause className="size-3.5" />
            Pause
          </Button>
        )}
        {automation.activeTrustGrantCount > 0 ? (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => actions.revokeTrust.mutate(automation.id)} disabled={actions.revokeTrust.isPending}>
            <ShieldCheck className="size-3.5" />
            Revoke trust
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => actions.grantTrust.mutate(automation.id)} disabled={actions.grantTrust.isPending}>
            <ShieldCheck className="size-3.5" />
            Grant trust
          </Button>
        )}
      </div>
    </section>
  );
}

function ActionStrip({ automation, latestRun }: { automation: CloudAutomation; latestRun?: CloudAutomationRun }) {
  const actions = useCloudAutomationActions();

  return (
    <div className="flex flex-wrap gap-2">
      <Button className="gap-1.5" onClick={() => actions.runNow.mutate(automation.id)} disabled={actions.runNow.isPending}>
        <Play className="size-4" />
        Run now
      </Button>
      {automation.status === "paused" ? (
        <Button variant="outline" className="gap-1.5" onClick={() => actions.resume.mutate(automation.id)} disabled={actions.resume.isPending}>
          <Play className="size-4" />
          Resume
        </Button>
      ) : (
        <Button variant="outline" className="gap-1.5" onClick={() => actions.pause.mutate(automation.id)} disabled={actions.pause.isPending}>
          <Pause className="size-4" />
          Pause
        </Button>
      )}
      {automation.trustGrants.some((grant) => grant.status === "active") ? (
        <Button variant="outline" className="gap-1.5" onClick={() => actions.revokeTrust.mutate(automation.id)} disabled={actions.revokeTrust.isPending}>
          <ShieldCheck className="size-4" />
          Revoke trust
        </Button>
      ) : (
        <Button variant="outline" className="gap-1.5" onClick={() => actions.grantTrust.mutate(automation.id)} disabled={actions.grantTrust.isPending}>
          <ShieldCheck className="size-4" />
          Grant trust
        </Button>
      )}
      {latestRun ? (
        <Button variant="ghost" className="gap-1.5" onClick={() => actions.replayRun.mutate(automation.id)} disabled={actions.replayRun.isPending}>
          <RefreshCcw className="size-4" />
          Run again
        </Button>
      ) : null}
    </div>
  );
}

function RunsTable({ runs }: { runs: CloudAutomationRun[] }) {
  if (runs.length === 0) {
    return <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">No cloud runs yet.</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <Link href={`/runs/${run.id}`} prefetch={false} className="font-mono text-xs hover:underline">{run.id.slice(0, 8)}</Link>
                <div className="text-muted-foreground text-xs">{formatRelative(run.startedAt)}</div>
              </TableCell>
              <TableCell><StatusPill status={statusForCloudRun(run.status)} /></TableCell>
              <TableCell className="capitalize">{run.trigger}</TableCell>
              <TableCell className="max-w-[280px] truncate text-muted-foreground text-xs">{run.resultSummary ?? run.errorSummary ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Button asChild size="sm" variant="ghost" className="gap-1">
                  <Link href={`/runs/${run.id}`} prefetch={false}>
                    Open
                    <ChevronRight className="size-3.5" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LatestRunDetails({ run }: { run: CloudAutomationRun }) {
  const lastFrames = run.replayFrames.slice(-4);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>
                  <div className="font-medium text-sm">{event.type}</div>
                  <div className="max-w-[520px] truncate text-muted-foreground text-xs">{event.message}</div>
                </TableCell>
                <TableCell><Badge variant="outline">{event.source}</Badge></TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatRelative(event.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3">
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">Worker</div>
          <div className="mt-1 font-mono text-xs">{run.worker.poolId}</div>
          <div className="mt-1 truncate font-mono text-muted-foreground text-[11px]">{run.worker.fargateTaskArn}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">Usage</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <MiniStat label="Tokens" value={run.usage.modelTokens.toLocaleString()} />
            <MiniStat label="Tools" value={run.usage.toolCalls.toString()} />
            <MiniStat label="Browser" value={`${run.usage.browserMinutes}m`} />
            <MiniStat label="Worker" value={`${run.usage.workerSeconds}s`} />
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">Replay JSONL</div>
          <div className="mt-2 space-y-1">
            {lastFrames.map((frame) => (
              <code key={frame.id} className="block truncate rounded bg-muted px-2 py-1 font-mono text-[11px]">
                {frame.jsonl}
              </code>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TriggerRow({ trigger }: { trigger: CloudAutomationTrigger }) {
  const label =
    trigger.type === "schedule"
      ? formatCron(trigger.cron)
      : trigger.type === "composio_webhook"
        ? `${trigger.toolkit}:${trigger.event}`
        : "Manual run";
  const detail =
    trigger.type === "schedule"
      ? `${trigger.timezone} · ${trigger.eventBridgeName}`
      : trigger.type === "composio_webhook"
        ? trigger.triggerRef
        : "POST /v1/automations/:id/run";
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm">{label}</div>
        <Badge variant={trigger.status === "registered" ? "secondary" : "outline"}>{trigger.status.replaceAll("_", " ")}</Badge>
      </div>
      <div className="mt-1 truncate font-mono text-muted-foreground text-xs">{detail}</div>
    </div>
  );
}

function TrustGrantRow({ grant }: { grant: CloudTrustGrant }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{grant.label}</div>
          <div className="mt-1 text-muted-foreground text-xs">{grant.scopeDescription}</div>
        </div>
        <Badge variant={grant.status === "active" ? "default" : grant.status === "revoked" ? "destructive" : "outline"}>{grant.status.replaceAll("_", " ")}</Badge>
      </div>
      <div className="mt-2 font-mono text-muted-foreground text-[11px]">{grant.toolSlug}</div>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="font-semibold text-base">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </header>
      {children}
    </section>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: ComponentType<{ className?: string }>; label: string; value: string; detail: string }) {
  return (
    <div className="flex min-h-24 items-start gap-3 rounded-lg border bg-card p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
        <div className="mt-1 truncate font-semibold text-sm">{value}</div>
        <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</div>
      <div className="truncate font-semibold text-sm tabular-nums">{value}</div>
    </div>
  );
}

function AutomationStatus({ status }: { status: CloudAutomation["status"] }) {
  return (
    <Badge variant={status === "active" ? "default" : status === "paused" ? "secondary" : "outline"} className="h-auto min-h-5 gap-1 py-0.5">
      {status === "paused" ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
      {status}
    </Badge>
  );
}

function TrustBadge({ automation }: { automation: Pick<CloudAutomation, "trustGrants" | "approvalPolicy"> }) {
  const active = automation.trustGrants.filter((grant) => grant.status === "active").length;
  return (
    <Badge variant={active > 0 ? "secondary" : "outline"} className="h-auto min-h-5 gap-1 py-0.5">
      <ShieldCheck data-icon="inline-start" />
      {active > 0 ? `${active} trusted` : automation.approvalPolicy.mode.replaceAll("_", " ")}
    </Badge>
  );
}

function statusForCloudRun(status: CloudAutomationRun["status"]): RunStatus {
  if (status === "completed") return "verified";
  if (status === "awaiting_approval") return "paused";
  if (status === "cancelled") return "stopped";
  return status;
}

function triggerLabel(automation: CloudAutomationSummary): string {
  const types = new Set(automation.triggers.map((t) => t.type));
  if (types.has("schedule")) return "Schedule";
  if (types.has("composio_webhook")) return "Webhook";
  return "Manual";
}

function credentialLabel(key: string): string {
  const labels: Record<string, string> = {
    browserbase: "Browserbase",
    gmail: "Gmail",
    hubspot: "HubSpot",
    jobboardpro: "JobBoard Pro",
    quickbooks: "QuickBooks",
    sendblue: "Sendblue",
  };
  return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}
