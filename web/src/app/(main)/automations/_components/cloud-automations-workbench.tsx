"use client";

import Link from "next/link";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";

import {
  CalendarClock,
  ChevronRight,
  Clock,
  Ellipsis,
  FileSearch,
  Globe,
  KeyRound,
  Monitor,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Wrench,
} from "@/icons";

import { StatusPill } from "@/app/(main)/runs/_components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
            Tasks your agent runs for you on a set schedule or when something happens, all in the
            cloud. Every run shows up in Runs and Logs. Ask Basics to set one up.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric icon={Wrench} label="Saved" value={(automations ?? []).length.toString()} detail={`${active.length} active`} />
        <Metric icon={CalendarClock} label="Scheduled" value={scheduled.length.toString()} detail="Run on a timer or when something happens." />
        <Metric icon={Clock} label="Runs (7d)" value={runs7d.toString()} detail="Across all your automations." />
        <Metric icon={Globe} label="Runs in" value="Basics Cloud" detail="In the cloud, so you can watch it live." />
      </section>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : (automations ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-muted-foreground text-sm">
          No automations yet. Ask Basics to do something repeatable, then save it as an automation.
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
              <RunTargetBadge runTarget={automation.runTarget} />
              <TrustBadge automation={automation} />
            </div>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">{automation.description}</p>
          </div>
          <ActionStrip automation={automation} latestRun={latestRun} />
        </div>
        {automation.status === "draft" ? (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-amber-800 text-sm dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
            This automation is a <strong>draft</strong> — it won&apos;t run on its schedule until you <strong>Activate</strong> it.
            Use <em>Test run</em> to try it once first.
          </div>
        ) : null}
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric icon={CalendarClock} label="Schedule" value={schedule ? formatCron(schedule.cron) : "Manual"} detail={schedule ? schedule.timezone : "No registered cron"} />
        <Metric icon={ShieldCheck} label="Auto-approved" value={activeTrust.length.toString()} detail={automation.approvalPolicy.mode.replaceAll("_", " ")} />
        {automation.runTarget === "local" ? (
          <Metric icon={Monitor} label="Runs on" value="Your computer" detail="Only when your desktop is online." />
        ) : (
          <Metric icon={Globe} label="Runs in" value="Basics Cloud" detail="In the cloud, so you can watch it live." />
        )}
        <Metric icon={FileSearch} label="Runs" value={runs.length.toString()} detail="Times this automation has run." />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-6">
          <Panel title="What it does" description="What you asked this automation to do.">
            <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">{automation.goal}</div>
          </Panel>

          <Panel title="Runs" description="Every time this automation has run. Open one to see the full timeline.">
            <RunsTable runs={runs} />
          </Panel>

          {latestRun && latestRun.events.length > 0 ? (
            <Panel title="Most recent run" description="Step by step of what happened in the latest run.">
              <LatestRunDetails run={latestRun} />
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Panel title="Schedule" description="When this automation runs on its own.">
            <ScheduleEditor automationId={automation.id} schedule={schedule} />
          </Panel>

          <Panel title="Where it runs" description="Cloud runs anytime. Local drives your computer — only when your desktop is online.">
            <div className="grid grid-cols-2 gap-2">
              {(["cloud", "local"] as const).map((target) => {
                const selected = automation.runTarget === target;
                const Icon = target === "local" ? Monitor : Globe;
                return (
                  <button
                    key={target}
                    type="button"
                    onClick={() => actions.setRunTarget.mutate({ automationId: automation.id, target })}
                    disabled={actions.setRunTarget.isPending || selected}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
                      selected ? "border-foreground bg-muted/60 font-medium" : "hover:border-foreground/30",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>
                      {target === "local" ? "My computer" : "Basics Cloud"}
                      <span className="block text-muted-foreground text-xs">
                        {target === "local" ? "Needs your desktop online" : "Runs anytime"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Triggers" description="What can start this automation.">
            <div className="space-y-2">
              {automation.triggers.map((trigger) => (
                <TriggerRow key={trigger.id} trigger={trigger} />
              ))}
            </div>
          </Panel>

          <Panel title="Sign-ins it needs" description="Accounts this automation signs in to when it runs.">
            <div className="flex flex-wrap gap-1.5">
              {automation.requiredCredentials.map((credential) => (
                <Badge key={credential} variant="secondary" className="h-auto min-h-5 py-0.5">
                  <KeyRound data-icon="inline-start" />
                  {credentialLabel(credential)}
                </Badge>
              ))}
            </div>
          </Panel>

          <Panel title="Pre-approved actions" description="Actions you've allowed so it doesn't ask every time.">
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
            <RunTargetBadge runTarget={automation.runTarget} />
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

      <div className="mt-4 flex items-center gap-2">
        {automation.status === "draft" ? (
          <Button size="sm" className="gap-1.5" onClick={() => actions.activate.mutate(automation.id)} disabled={actions.activate.isPending}>
            <Play className="size-3.5" />
            {actions.activate.isPending ? "Activating…" : "Activate"}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant={automation.status === "draft" ? "outline" : "default"}
          className="gap-1.5"
          onClick={() => actions.runNow.mutate(automation.id)}
          disabled={actions.runNow.isPending}
        >
          <Play className="size-3.5" />
          {automation.status === "draft" ? "Test run" : "Run now"}
        </Button>
        {automation.status === "active" ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => actions.pause.mutate(automation.id)} disabled={actions.pause.isPending}>
            <Pause className="size-3.5" />
            Pause
          </Button>
        ) : automation.status === "paused" ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => actions.resume.mutate(automation.id)} disabled={actions.resume.isPending}>
            <Play className="size-3.5" />
            Resume
          </Button>
        ) : null}
        <DropdownMenu onOpenChange={(open) => !open && setConfirmDelete(false)}>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label={`More actions for ${automation.name}`}>
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => actions.triggerSchedule.mutate(automation.id)} disabled={actions.triggerSchedule.isPending}>
              <CalendarClock className="size-4" />
              Run on its schedule
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {automation.activeTrustGrantCount > 0 ? (
              <DropdownMenuItem onClick={() => actions.revokeTrust.mutate(automation.id)} disabled={actions.revokeTrust.isPending}>
                <ShieldCheck className="size-4" />
                Stop auto-approving
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => actions.grantTrust.mutate(automation.id)} disabled={actions.grantTrust.isPending}>
                <ShieldCheck className="size-4" />
                Approve actions automatically
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              disabled={actions.deleteAutomation.isPending}
              onSelect={(e) => {
                e.preventDefault();
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                actions.deleteAutomation.mutate(automation.id);
              }}
            >
              <Trash2 className="size-4" />
              {confirmDelete ? "Click again — deletes it + all runs" : "Delete automation"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}

function ActionStrip({ automation, latestRun }: { automation: CloudAutomation; latestRun?: CloudAutomationRun }) {
  const actions = useCloudAutomationActions();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {automation.status === "draft" ? (
          <Button className="gap-1.5" onClick={() => actions.activate.mutate(automation.id)} disabled={actions.activate.isPending}>
            <Play className="size-4" />
            {actions.activate.isPending ? "Activating…" : "Activate"}
          </Button>
        ) : null}
        <Button
          variant={automation.status === "draft" ? "outline" : "default"}
          className="gap-1.5"
          onClick={() => actions.runNow.mutate(automation.id)}
          disabled={actions.runNow.isPending}
        >
          <Play className="size-4" />
          {automation.status === "draft" ? "Test run" : "Run now"}
        </Button>
        {automation.status === "active" ? (
          <Button variant="outline" className="gap-1.5" onClick={() => actions.pause.mutate(automation.id)} disabled={actions.pause.isPending}>
            <Pause className="size-4" />
            Pause
          </Button>
        ) : automation.status === "paused" ? (
          <Button variant="outline" className="gap-1.5" onClick={() => actions.resume.mutate(automation.id)} disabled={actions.resume.isPending}>
            <Play className="size-4" />
            Resume
          </Button>
        ) : null}
      {automation.trustGrants.some((grant) => grant.status === "active") ? (
        <Button variant="outline" className="gap-1.5" onClick={() => actions.revokeTrust.mutate(automation.id)} disabled={actions.revokeTrust.isPending}>
          <ShieldCheck className="size-4" />
          Stop auto-approving
        </Button>
      ) : (
        <Button variant="outline" className="gap-1.5" onClick={() => actions.grantTrust.mutate(automation.id)} disabled={actions.grantTrust.isPending}>
          <ShieldCheck className="size-4" />
          Approve automatically
        </Button>
      )}
      {latestRun ? (
        <Button variant="ghost" className="gap-1.5" onClick={() => actions.replayRun.mutate(automation.id)} disabled={actions.replayRun.isPending}>
          <RefreshCcw className="size-4" />
          Run again
        </Button>
      ) : null}
      </div>
      {actions.activate.isError ? (
        <p className="max-w-xs text-right text-destructive text-xs">{actions.activate.error?.message}</p>
      ) : null}
    </div>
  );
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const WEEKDAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

type ScheduleFrequency = "manual" | "hourly" | "daily" | "weekdays" | "weekly" | "custom";

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

/** Best-effort parse of a 5-field cron into the friendly picker model. */
function cronToScheduleModel(cron: string | undefined): { freq: ScheduleFrequency; hour: number; dow: string } {
  if (!cron) return { freq: "manual", hour: 9, dow: "1" };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return { freq: "custom", hour: 9, dow: "1" };
  const [min, hr, dom, mon, dowF] = parts;
  if (min === "0" && hr === "*" && dom === "*" && mon === "*" && dowF === "*") return { freq: "hourly", hour: 9, dow: "1" };
  const h = /^\d{1,2}$/.test(hr ?? "") ? Math.min(23, parseInt(hr!, 10)) : 9;
  if (min === "0" && /^\d{1,2}$/.test(hr ?? "") && dom === "*" && mon === "*") {
    if (dowF === "*") return { freq: "daily", hour: h, dow: "1" };
    if (dowF === "1-5") return { freq: "weekdays", hour: h, dow: "1" };
    if (/^[0-6]$/.test(dowF ?? "")) return { freq: "weekly", hour: h, dow: dowF! };
  }
  return { freq: "custom", hour: h, dow: "1" };
}

function scheduleModelToCron(freq: ScheduleFrequency, hour: number, dow: string, custom: string): string | null {
  switch (freq) {
    case "manual":
      return null;
    case "hourly":
      return "0 * * * *";
    case "daily":
      return `0 ${hour} * * *`;
    case "weekdays":
      return `0 ${hour} * * 1-5`;
    case "weekly":
      return `0 ${hour} * * ${dow}`;
    case "custom":
      return custom.trim() || "0 9 * * *";
  }
}

function SchedField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 text-sm">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      {children}
    </div>
  );
}

/** Friendly schedule picker — frequency + time/day + timezone dropdowns, plus a
 *  Manual option that drops the schedule trigger (no raw cron unless "Custom"). */
function ScheduleEditor({
  automationId,
  schedule,
}: {
  automationId: string;
  schedule?: Extract<CloudAutomationTrigger, { type: "schedule" }>;
}) {
  const actions = useCloudAutomationActions();
  const initial = cronToScheduleModel(schedule?.cron);
  const [freq, setFreq] = useState<ScheduleFrequency>(initial.freq);
  const [hour, setHour] = useState(initial.hour);
  const [dow, setDow] = useState(initial.dow);
  const [custom, setCustom] = useState(schedule?.cron ?? "0 9 * * 1-5");
  const [tz, setTz] = useState(schedule?.timezone ?? "America/New_York");

  const busy = actions.updateSchedule.isPending || actions.clearSchedule.isPending;
  const showTime = freq === "daily" || freq === "weekly" || freq === "weekdays";

  const save = () => {
    if (freq === "manual") {
      actions.clearSchedule.mutate(automationId);
      return;
    }
    const cron = scheduleModelToCron(freq, hour, dow, custom);
    if (!cron) return;
    actions.updateSchedule.mutate({ automationId, cron, timezone: tz });
  };

  return (
    <div className="space-y-3">
      <SchedField label="Runs">
        <Select value={freq} onValueChange={(v) => setFreq(v as ScheduleFrequency)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Only when I run it</SelectItem>
            <SelectItem value="hourly">Every hour</SelectItem>
            <SelectItem value="daily">Every day</SelectItem>
            <SelectItem value="weekdays">Every weekday (Mon–Fri)</SelectItem>
            <SelectItem value="weekly">Every week</SelectItem>
            <SelectItem value="custom">Custom…</SelectItem>
          </SelectContent>
        </Select>
      </SchedField>

      {freq === "weekly" ? (
        <SchedField label="On">
          <Select value={dow} onValueChange={setDow}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAYS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SchedField>
      ) : null}

      {showTime ? (
        <SchedField label="At">
          <Select value={String(hour)} onValueChange={(v) => setHour(parseInt(v, 10))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem key={h} value={String(h)}>
                  {hourLabel(h)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SchedField>
      ) : null}

      {freq === "custom" ? (
        <SchedField label="Cron expression">
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="0 9 * * 1-5" />
        </SchedField>
      ) : null}

      {freq !== "manual" ? (
        <SchedField label="Timezone">
          <Select value={tz} onValueChange={setTz}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((z) => (
                <SelectItem key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SchedField>
      ) : null}

      <Button variant="outline" className="w-full gap-1.5" onClick={save} disabled={busy}>
        <CalendarClock className="size-4" />
        {freq === "manual" ? "Set to manual" : "Save schedule"}
      </Button>
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
          <div className="text-muted-foreground text-xs uppercase tracking-wide">Where it ran</div>
          <div className="mt-1 font-mono text-xs">{run.worker.poolId}</div>
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
          <div className="text-muted-foreground text-xs uppercase tracking-wide">Raw events</div>
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
        : "Started by hand";
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

// Only badge the LOCAL ones — cloud is the default, so a badge there is noise.
function RunTargetBadge({ runTarget }: { runTarget: CloudAutomation["runTarget"] }) {
  if (runTarget !== "local") return null;
  return (
    <Badge variant="outline" className="h-auto min-h-5 gap-1 py-0.5" title="Runs on your computer — only when your desktop is online">
      <Monitor data-icon="inline-start" />
      Local
    </Badge>
  );
}

function TrustBadge({ automation }: { automation: Pick<CloudAutomation, "trustGrants" | "approvalPolicy"> }) {
  const active = automation.trustGrants.filter((grant) => grant.status === "active").length;
  return (
    <Badge variant={active > 0 ? "secondary" : "outline"} className="h-auto min-h-5 gap-1 py-0.5">
      <ShieldCheck data-icon="inline-start" />
      {active > 0 ? `${active} auto-approved` : automation.approvalPolicy.mode.replaceAll("_", " ")}
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
  if (types.has("composio_webhook")) return "Event";
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
