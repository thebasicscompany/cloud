"use client";

import Link from "next/link";
import type { ComponentType } from "react";

import {
  Brain,
  ChevronRight,
  Clock,
  Eye,
  Folder,
  Globe,
  Hand,
  Monitor,
  Play,
  ShieldCheck,
  TriangleAlertIcon,
  Workflow,
} from "@/icons";

import { PendingCard } from "@/app/(main)/approvals/_components/pending-card";
import { LocalAgentWorkbench } from "@/app/(main)/_components/local-agent-workbench";
import { LiveRunCard } from "@/app/(main)/runs/_components/live-run-card";
import { StatusPill } from "@/app/(main)/runs/_components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isPendingApproval, useApprovals } from "@/hooks/queries/use-approvals";
import { useApps } from "@/hooks/queries/use-apps";
import { useCloudAutomations } from "@/hooks/queries/use-cloud-automations";
import { useRuns } from "@/hooks/queries/use-runs";
import { formatRelative } from "@/lib/format";
import type { Run, RunStatus } from "@/types/runs";

const LIVE_STATUSES = new Set<RunStatus>(["pending", "booting", "running", "paused", "paused_by_user", "verifying"]);

function needsAttention(run: Run): boolean {
  return run.status === "failed" || run.status === "unverified";
}

export function HomeDashboard() {
  const { data: runs, isLoading: runsLoading } = useRuns({});
  const { data: approvals, isLoading: approvalsLoading } = useApprovals({});
  const { data: apps, isLoading: appsLoading } = useApps();
  const { data: automations, isLoading: automationsLoading } = useCloudAutomations();

  const liveRuns = (runs ?? []).filter((r) => LIVE_STATUSES.has(r.status)).slice().sort(sortByStartedDesc);
  const pendingApprovals = (approvals ?? []).filter(isPendingApproval).slice().sort(sortByRequestedDesc);
  const attentionRuns = (runs ?? []).filter(needsAttention).slice().sort(sortByStartedDesc).slice(0, 6);
  const browserRunCount = (runs ?? []).filter((run) => run.browserRuntimeTarget).length;
  const appQueue = (apps ?? []).filter(
    (app) => app.status === "pending_review" || app.status === "update_available" || app.status === "blocked",
  );

  const activeAutomations = (automations ?? []).filter((automation) => automation.status === "active");
  const loading = runsLoading || approvalsLoading || appsLoading || automationsLoading;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">basichome</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Your AI work cockpit: local context, active agent work, saved automations, private apps, approvals, and cloud runs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="h-auto min-h-6 gap-1.5 py-1">
            <Monitor data-icon="inline-start" />
            Local first
          </Badge>
          <Badge variant="outline" className="h-auto min-h-6 gap-1.5 py-1">
            <ShieldCheck data-icon="inline-start" />
            Cloud ready
          </Badge>
          <Badge variant="secondary" className="h-auto min-h-6 gap-1.5 py-1">
            <Globe data-icon="inline-start" />
            Raw capture local
          </Badge>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <NowCard icon={Brain} label="Agent" value="Standby" detail="Ready for local tasks, app-building, and cloud promotion." />
        <NowCard icon={Eye} label="Lens" value="Local capture" detail="Raw screen/audio context stays on this device." />
        <NowCard icon={Monitor} label="Local runner" value="Available" detail={`${liveRuns.length} active local/cloud-visible run${liveRuns.length === 1 ? "" : "s"}.`} />
        <NowCard icon={ShieldCheck} label="Trust" value="Review gated" detail={`${pendingApprovals.length} approval${pendingApprovals.length === 1 ? "" : "s"} waiting.`} />
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {loading ? (
          ["stat-skeleton-1", "stat-skeleton-2", "stat-skeleton-3", "stat-skeleton-4", "stat-skeleton-5"].map((key) => <Skeleton key={key} className="h-28 rounded-lg" />)
        ) : (
          <>
            <StatCard href="/runs" title="Running now" subtitle="active runs" value={liveRuns.length} icon={Play} />
            <StatCard href="/browser" title="Browser" subtitle="local profiles" value={browserRunCount} icon={Globe} />
            <StatCard href="/approvals" title="Needs review" subtitle="pending approvals" value={pendingApprovals.length} icon={Hand} />
            <StatCard href="/apps" title="App queue" subtitle="updates or blocks" value={appQueue.length} icon={Folder} />
            <StatCard href="/runs" title="Needs attention" subtitle="failed or unverified" value={attentionRuns.length} icon={TriangleAlertIcon} />
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Agent workbench</CardTitle>
            <CardDescription>Current task state, runtime target, and control surface.</CardDescription>
          </CardHeader>
          <CardContent>
            <LocalAgentWorkbench />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Attention queue</CardTitle>
            <CardDescription>Approvals, blocked apps, and failed runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {approvalsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
            ) : pendingApprovals.length === 0 && appQueue.length === 0 && attentionRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-sm">Nothing needs your attention.</div>
            ) : (
              <>
                {pendingApprovals.slice(0, 2).map((approval) => (
                  <PendingCard key={approval.id} approval={approval} />
                ))}
                {appQueue.slice(0, 2).map((app) => (
                  <Link key={app.id} href="/apps" prefetch={false} className="flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40">
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{app.name}</div>
                      <div className="truncate text-muted-foreground text-xs">{app.lastEvent}</div>
                    </div>
                    <Badge variant={app.status === "blocked" ? "destructive" : "outline"} className="h-auto min-h-5 shrink-0 py-0.5">
                      {app.status === "blocked" ? "Blocked" : "Review"}
                    </Badge>
                  </Link>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Live runs"
          description="Pinned while status is active."
          href="/runs"
          action="View all"
        />
        {runsLoading ? (
          <div className="flex gap-4 overflow-hidden pb-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 min-w-[320px] shrink-0 rounded-lg" />
            ))}
          </div>
        ) : liveRuns.length === 0 ? (
          <EmptyPanel
            title="Nothing running right now."
            description="Saved automations, browser tasks, and app workers appear here when they start."
            href="/automations"
            action="Browse automations"
          />
        ) : (
          <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3">
            {liveRuns.map((run) => (
              <LiveRunCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Apps and automations health</CardTitle>
            <CardDescription>Private tools, saved automations, updates, credentials, and rollout state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <HealthMeter icon={Folder} label="Private apps" value={`${apps?.length ?? 0}`} detail={`${appQueue.length} need review or repair`} progress={apps?.length ? Math.max(15, ((apps.length - appQueue.length) / apps.length) * 100) : 0} />
              <HealthMeter icon={Workflow} label="Saved automations" value={`${activeAutomations.length}`} detail={`${automations?.length ?? 0} cloud definitions`} progress={automations?.length ? Math.max(15, (activeAutomations.length / automations.length) * 100) : 0} />
            </div>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(automations ?? []).slice(0, 3).map((automation) => (
                    <TableRow key={automation.id}>
                      <TableCell>
                        <Link href={`/automations/${automation.id}`} prefetch={false} className="font-medium hover:underline underline-offset-2">
                          {automation.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={automation.status === "active" ? "secondary" : "outline"} className="h-auto min-h-5 py-0.5">
                          {automation.status === "active" ? "Active" : "Paused"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground text-sm sm:table-cell">
                        {automation.lastRun ? formatRelative(automation.lastRun.startedAt) : "No recent run"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Context and autonomy</CardTitle>
            <CardDescription>What basichome can see, remember, trust, and export.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ContextRow icon={Globe} title="Lens capture" value="Local only" detail="Raw screenshots, OCR, audio, and input timelines stay on this device." />
            <ContextRow icon={Brain} title="Distilled memory" value="Approved summaries" detail="Session summaries can feed workspace memory and automation suggestions." />
            <ContextRow icon={ShieldCheck} title="Autonomy" value="Trust grant required" detail="Sensitive or recurring work needs approval before it runs unattended." />
            <ContextRow icon={Clock} title="Cloud" value="Reliability layer" detail="Use cloud for scheduled, overnight, and shared workspace runs." />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Needs attention"
          description="Recent outcomes that are not clean success."
          href="/runs"
          action="Full history"
        />
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Last activity</TableHead>
                <TableHead className="hidden md:table-cell">Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_x, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full max-w-[180px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : attentionRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground text-sm">
                    No flagged runs in the mock set.
                  </TableCell>
                </TableRow>
              ) : (
                attentionRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link
                        href={`/runs/${run.id}`}
                        prefetch={false}
                        className="font-medium hover:underline underline-offset-2"
                      >
                        {run.workflowName}
                      </Link>
                      <div className="font-mono text-muted-foreground text-xs">{run.id}</div>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={run.status} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground text-sm sm:table-cell">
                      {formatRelative(run.completedAt ?? run.startedAt)}
                    </TableCell>
                    <TableCell className="hidden max-w-[280px] truncate text-muted-foreground text-sm md:table-cell">
                      {run.errorSummary ?? "—"}
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

function NowCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex min-h-24 items-start gap-3 rounded-lg border bg-card p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
        <div className="mt-1 font-semibold text-sm">{value}</div>
        <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      </div>
    </div>
  );
}

function StatCard({
  href,
  title,
  subtitle,
  value,
  icon: Icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href} prefetch={false} className="group block">
      <Card className="h-full transition-colors hover:border-primary/35">
        <CardHeader className="flex flex-row items-start justify-between gap-y-0 pb-2">
          <CardTitle className="font-medium text-muted-foreground text-sm">{title}</CardTitle>
          <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
        </CardHeader>
        <CardContent>
          <div className="font-semibold text-3xl tabular-nums">{value}</div>
          <CardDescription className="mt-1">{subtitle}</CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionHeader({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" asChild>
        <Link href={href} prefetch={false}>
          {action}
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}

function EmptyPanel({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card py-12 text-center">
      <p className="font-medium text-sm">{title}</p>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">{description}</p>
      <Button className="mt-4" variant="outline" size="sm" asChild>
        <Link href={href} prefetch={false}>
          {action}
        </Link>
      </Button>
    </div>
  );
}

function HealthMeter({
  icon: Icon,
  label,
  value,
  detail,
  progress,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
  progress: number;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">{label}</span>
        </div>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <Progress value={progress} className="mt-3 h-1.5" />
      <div className="mt-2 text-muted-foreground text-xs">{detail}</div>
    </div>
  );
}

function ContextRow({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium text-sm">{title}</div>
          <Badge variant="outline" className="h-auto min-h-5 py-0.5">
            {value}
          </Badge>
        </div>
        <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      </div>
    </div>
  );
}

function sortByStartedDesc(a: Run, b: Run): number {
  return b.startedAt.localeCompare(a.startedAt);
}

function sortByRequestedDesc(a: { requestedAt: string }, b: { requestedAt: string }): number {
  return b.requestedAt.localeCompare(a.requestedAt);
}
