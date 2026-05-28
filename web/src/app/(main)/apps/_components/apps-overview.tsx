"use client";

import { useMemo, useState } from "react";

import {
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  Folder,
  Play,
  RefreshCcw,
  ShieldCheck,
  TriangleAlertIcon,
} from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  appNeedsReview,
  useApps,
  useWorkspaceAppActions,
  useWorkspaceAppsStore,
} from "@/hooks/queries/use-apps";
import { formatRelative } from "@/lib/format";
import {
  selectActiveRelease,
  selectDeploymentsForApp,
  selectLatestRelease,
  selectPendingRelease,
} from "@/lib/workspace-apps-runtime";
import type {
  AppApprovalState,
  AppDeploymentCheck,
  AppReleaseStatus,
  BasicsAppManifestUnit,
  WorkspaceApp,
  WorkspaceAppStatus,
  WorkspaceAppTarget,
  WorkspaceAppsStore,
} from "@/types/apps";

const statusCopy: Record<WorkspaceAppStatus, string> = {
  installed: "Installed",
  update_available: "Update ready",
  pending_review: "Pending review",
  blocked: "Blocked",
};

const targetCopy: Record<WorkspaceAppTarget, string> = {
  local: "Local",
  cloud: "Cloud",
  local_and_cloud: "Local + cloud",
};

const releaseCopy: Record<AppReleaseStatus, string> = {
  draft: "Draft",
  local_installed: "Local install",
  pending_review: "Pending review",
  approved: "Approved",
  deploying: "Deploying",
  deployed: "Deployed",
  rolled_back: "Rolled back",
  blocked: "Blocked",
};

const approvalCopy: Record<AppApprovalState, string> = {
  not_required: "Not required",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export function AppsOverview() {
  const { data: apps, isLoading: appsLoading } = useApps();
  const { data: store, isLoading: storeLoading } = useWorkspaceAppsStore();
  const actions = useWorkspaceAppActions();
  const [selectedAppId, setSelectedAppId] = useState<string | undefined>(undefined);
  const isLoading = appsLoading || storeLoading;

  const selectedApp = useMemo(() => {
    if (!apps?.length) return undefined;
    return apps.find((app) => app.id === selectedAppId) ?? apps[0];
  }, [apps, selectedAppId]);

  const selectedBundle = selectedApp && store
    ? {
        pendingRelease: selectPendingRelease(store, selectedApp.id),
        activeRelease: selectActiveRelease(store, selectedApp.id),
        latestRelease: selectLatestRelease(store, selectedApp.id),
        deployments: selectDeploymentsForApp(store, selectedApp.id),
        logs: store.logs.filter((log) => log.appId === selectedApp.id).slice(0, 5),
      }
    : undefined;

  if (isLoading || !apps || !store) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  const blocked = apps.filter((app) => app.health === "blocked");
  const pending = apps.filter(appNeedsReview);
  const deployed = apps.filter((app) => app.status === "installed");
  const cloudDeployments = store.deployments.filter((deployment) => deployment.target === "cloud" && deployment.status === "active");

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        <SummaryCard icon={Folder} label="Workspace apps" value={apps.length.toString()} detail="Private tools in this basichome workspace." />
        <SummaryCard icon={ShieldCheck} label="Review queue" value={pending.length.toString()} detail="CLI releases waiting on scan, approval, deploy, or repair." />
        <SummaryCard icon={Play} label="Active deploys" value={deployed.length.toString()} detail={`${cloudDeployments.length} cloud target${cloudDeployments.length === 1 ? "" : "s"} active.`} />
        <SummaryCard icon={TriangleAlertIcon} label="Blocked" value={blocked.length.toString()} detail="Fail-closed checks or missing credentials." />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <h2 className="font-semibold text-base">CLI release lane</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            `basics app check` is the shared gate for local install, publish, cloud deploy, updates, and rollback.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => actions.publishCliSample.mutate()}
          disabled={actions.publishCliSample.isPending}
          data-testid="apps-sync-cli-sample"
          className="gap-2"
        >
          <Code2 data-icon="inline-start" />
          Sync CLI sample
        </Button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>App</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Target</TableHead>
                <TableHead className="hidden lg:table-cell">Release</TableHead>
                <TableHead className="hidden xl:table-cell">Permissions</TableHead>
                <TableHead className="w-[184px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((app) => (
                <AppRow
                  key={app.id}
                  app={app}
                  store={store}
                  selected={selectedApp?.id === app.id}
                  onSelect={() => setSelectedAppId(app.id)}
                  onApprove={(releaseId) => actions.approveRelease.mutate(releaseId)}
                  onDeploy={(releaseId) => actions.deployRelease.mutate(releaseId)}
                  onRollback={(appId) => actions.rollbackApp.mutate(appId)}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {selectedApp && selectedBundle ? (
          <AppDetailPanel
            app={selectedApp}
            store={store}
            pendingRelease={selectedBundle.pendingRelease}
            activeRelease={selectedBundle.activeRelease}
            latestRelease={selectedBundle.latestRelease}
            deployments={selectedBundle.deployments}
            logs={selectedBundle.logs}
            onApprove={(releaseId) => actions.approveRelease.mutate(releaseId)}
            onDeploy={(releaseId) => actions.deployRelease.mutate(releaseId)}
            onRollback={(appId) => actions.rollbackApp.mutate(appId)}
          />
        ) : null}
      </section>
    </div>
  );
}

function AppRow({
  app,
  store,
  selected,
  onSelect,
  onApprove,
  onDeploy,
  onRollback,
}: {
  app: WorkspaceApp;
  store: WorkspaceAppsStore;
  selected: boolean;
  onSelect: () => void;
  onApprove: (releaseId: string) => void;
  onDeploy: (releaseId: string) => void;
  onRollback: (appId: string) => void;
}) {
  const pendingRelease = selectPendingRelease(store, app.id);
  const activeRelease = selectActiveRelease(store, app.id);
  const latestRelease = pendingRelease ?? activeRelease;
  const badgeVariant = app.status === "blocked" ? "destructive" : app.status === "installed" ? "secondary" : "outline";

  return (
    <TableRow
      className={selected ? "bg-muted/50" : undefined}
      onClick={onSelect}
      data-testid={`app-row-${app.id}`}
    >
      <TableCell>
        <div className="font-medium">{app.name}</div>
        <div className="max-w-[360px] truncate text-muted-foreground text-xs">{app.description}</div>
        <div className="mt-1 font-mono text-muted-foreground text-xs">{app.cliProjectPath}</div>
      </TableCell>
      <TableCell>
        <Badge variant={badgeVariant} className="h-auto min-h-5 py-0.5">
          {statusCopy[app.status]}
        </Badge>
        <div className="mt-1 text-muted-foreground text-xs">{formatRelative(app.updatedAt)}</div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground text-sm md:table-cell">{targetCopy[app.target]}</TableCell>
      <TableCell className="hidden lg:table-cell">
        {latestRelease ? (
          <div>
            <div className="font-mono text-xs">{latestRelease.version}</div>
            <div className="text-muted-foreground text-xs">{releaseCopy[latestRelease.status]}</div>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">No release</span>
        )}
      </TableCell>
      <TableCell className="hidden max-w-[260px] xl:table-cell">
        <div className="flex flex-wrap gap-1">
          {app.permissions.slice(0, 3).map((permission) => (
            <Badge key={permission} variant="outline" className="h-auto min-h-5 py-0.5 font-mono text-[11px] font-normal">
              {permission}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <ActionButton
          app={app}
          pendingReleaseId={pendingRelease?.id}
          pendingApproval={pendingRelease?.approvalState}
          activeReleaseId={activeRelease?.id}
          onApprove={onApprove}
          onDeploy={onDeploy}
          onRollback={onRollback}
        />
      </TableCell>
    </TableRow>
  );
}

function ActionButton({
  app,
  pendingReleaseId,
  pendingApproval,
  activeReleaseId,
  onApprove,
  onDeploy,
  onRollback,
}: {
  app: WorkspaceApp;
  pendingReleaseId?: string;
  pendingApproval?: AppApprovalState;
  activeReleaseId?: string;
  onApprove: (releaseId: string) => void;
  onDeploy: (releaseId: string) => void;
  onRollback: (appId: string) => void;
}) {
  if (app.status === "blocked") {
    return (
      <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled>
        <TriangleAlertIcon data-icon="inline-start" />
        Blocked
      </Button>
    );
  }
  if (pendingReleaseId && pendingApproval === "pending") {
    return (
      <Button
        type="button"
        size="sm"
        className="gap-1.5"
        onClick={(event) => {
          event.stopPropagation();
          onApprove(pendingReleaseId);
        }}
        data-testid={`approve-release-${pendingReleaseId}`}
      >
        <ShieldCheck data-icon="inline-start" />
        Approve
      </Button>
    );
  }
  if (pendingReleaseId && pendingApproval === "approved") {
    return (
      <Button
        type="button"
        size="sm"
        className="gap-1.5"
        onClick={(event) => {
          event.stopPropagation();
          onDeploy(pendingReleaseId);
        }}
        data-testid={`deploy-release-${pendingReleaseId}`}
      >
        <Play data-icon="inline-start" />
        Deploy
      </Button>
    );
  }
  if (activeReleaseId) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={(event) => {
          event.stopPropagation();
          onRollback(app.id);
        }}
        data-testid={`rollback-app-${app.id}`}
      >
        <RefreshCcw data-icon="inline-start" />
        Rollback
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5">
      <ExternalLink data-icon="inline-start" />
      Open
    </Button>
  );
}

function AppDetailPanel({
  app,
  pendingRelease,
  activeRelease,
  latestRelease,
  deployments,
  logs,
  onApprove,
  onDeploy,
  onRollback,
}: {
  app: WorkspaceApp;
  store: WorkspaceAppsStore;
  pendingRelease?: ReturnType<typeof selectPendingRelease>;
  activeRelease?: ReturnType<typeof selectActiveRelease>;
  latestRelease?: ReturnType<typeof selectLatestRelease>;
  deployments: ReturnType<typeof selectDeploymentsForApp>;
  logs: WorkspaceAppsStore["logs"];
  onApprove: (releaseId: string) => void;
  onDeploy: (releaseId: string) => void;
  onRollback: (appId: string) => void;
}) {
  const check = latestRelease?.scanResult;

  return (
    <aside className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{app.name}</CardTitle>
              <CardDescription>{app.owner} · {targetCopy[app.target]}</CardDescription>
            </div>
            <Badge variant={app.health === "blocked" ? "destructive" : app.health === "healthy" ? "secondary" : "outline"} className="h-auto min-h-5 py-0.5">
              {app.health}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Last event</div>
            <div className="mt-1 text-sm">{app.lastEvent}</div>
          </div>

          {latestRelease ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <SmallFact label="Release" value={latestRelease.version} />
              <SmallFact label="Status" value={releaseCopy[latestRelease.status]} />
              <SmallFact label="Approval" value={approvalCopy[latestRelease.approvalState]} />
              <SmallFact label="Hash" value={latestRelease.artifactHash.replace(/^sha256:/, "").slice(0, 12)} mono />
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {pendingRelease?.approvalState === "pending" ? (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => onApprove(pendingRelease.id)} data-testid="detail-approve-release">
                <ShieldCheck data-icon="inline-start" />
                Approve release
              </Button>
            ) : null}
            {pendingRelease?.approvalState === "approved" ? (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => onDeploy(pendingRelease.id)} data-testid="detail-deploy-release">
                <Play data-icon="inline-start" />
                Deploy update
              </Button>
            ) : null}
            {activeRelease ? (
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onRollback(app.id)} data-testid="detail-rollback-app">
                <RefreshCcw data-icon="inline-start" />
                Rollback
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Deployment gate</CardTitle>
          <CardDescription>Shared `runAppDeploymentCheck` result for build, publish, install, deploy, and rollback.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {check ? <CheckPanel check={check} /> : null}
          <div className="grid gap-2 sm:grid-cols-3">
            <GateStep icon={Code2} label="Bundle" complete={Boolean(check?.ok)} />
            <GateStep icon={ShieldCheck} label="Admin" complete={latestRelease?.approvalState === "approved"} />
            <GateStep icon={Play} label="Deploy" complete={latestRelease?.status === "deployed"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Manifest</CardTitle>
          <CardDescription>UI, service, worker, migration, routes, schedules, queues, permissions, and secrets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            {app.manifest.units.map((unit) => (
              <UnitRow key={`${unit.kind}-${unit.name}`} unit={unit} />
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {app.manifest.secrets.map((secret) => (
              <Badge key={secret.name} variant="outline" className="h-auto min-h-5 py-0.5 font-mono text-[11px] font-normal">
                {secret.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Deployments and logs</CardTitle>
          <CardDescription>{deployments.length} target{deployments.length === 1 ? "" : "s"} recorded for this app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {deployments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">No active deployment yet.</div>
            ) : (
              deployments.slice(0, 3).map((deployment) => (
                <div key={deployment.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="secondary">{deployment.target}</Badge>
                    <span className="text-muted-foreground text-xs">{formatRelative(deployment.deployedAt)}</span>
                  </div>
                  <div className="mt-2 truncate font-mono text-xs">{deployment.endpoint}</div>
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{log.type}</div>
                  <span className="text-muted-foreground text-xs">{formatRelative(log.createdAt)}</span>
                </div>
                <div className="mt-1 text-muted-foreground text-xs">{log.message}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

function CheckPanel({ check }: { check: AppDeploymentCheck }) {
  const blockers = check.errors.length;
  const warnings = check.warnings.length;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {check.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <TriangleAlertIcon className="size-4 text-destructive" />}
          <span className="font-medium text-sm">{check.ok ? "Passed" : "Blocked"}</span>
        </div>
        <Badge variant={check.ok ? "secondary" : "destructive"} className="h-auto min-h-5 py-0.5">
          {check.manifestUnits} units
        </Badge>
      </div>
      <p className="mt-2 text-muted-foreground text-xs">{check.summary}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <SmallFact label="Discovered" value={check.discoveredUnits.toString()} />
        <SmallFact label="Blockers" value={blockers.toString()} />
        <SmallFact label="Warnings" value={warnings.toString()} />
      </div>
      {check.errors.slice(0, 2).map((error) => (
        <div key={error} className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive text-xs">
          {error}
        </div>
      ))}
    </div>
  );
}

function UnitRow({ unit }: { unit: BasicsAppManifestUnit }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-lg border p-3">
      <Badge variant="outline" className="h-auto min-h-5 justify-center py-0.5">
        {unit.kind}
      </Badge>
      <div className="min-w-0">
        <div className="font-medium text-sm">{unit.name}</div>
        <div className="truncate font-mono text-muted-foreground text-xs">{unit.path}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="secondary" className="h-auto min-h-5 py-0.5 font-mono text-[11px] font-normal">{unit.runtime}</Badge>
          {unit.route ? <Badge variant="outline" className="h-auto min-h-5 py-0.5 font-mono text-[11px] font-normal">{unit.route}</Badge> : null}
          {unit.queue ? <Badge variant="outline" className="h-auto min-h-5 py-0.5 font-mono text-[11px] font-normal">{unit.queue}</Badge> : null}
        </div>
      </div>
    </div>
  );
}

function GateStep({
  icon: Icon,
  label,
  complete,
}: {
  icon: typeof Code2;
  label: string;
  complete: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <Icon className="size-4 text-muted-foreground" />
        {complete ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Clock className="size-4 text-muted-foreground" />}
      </div>
      <div className="mt-2 font-medium text-sm">{label}</div>
      <div className="text-muted-foreground text-xs">{complete ? "Complete" : "Waiting"}</div>
    </div>
  );
}

function SmallFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</div>
      <div className={mono ? "mt-1 truncate font-mono text-sm" : "mt-1 truncate font-medium text-sm"}>{value}</div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Folder;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-muted-foreground text-sm">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="font-semibold text-2xl tabular-nums">{value}</div>
        <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}
