"use client";

import Link from "next/link";

import { Check, Clock, ExternalLink, ShieldCheck, TriangleAlertIcon, X } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import type {
  WorkspaceApproval,
  WorkspaceApprovalCheck,
  WorkspaceApprovalRisk,
  WorkspaceApprovalStatus,
} from "@/types/approvals";

const statusCopy: Record<WorkspaceApprovalStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  changes_requested: "Changes requested",
  expired: "Expired",
  revoked: "Revoked",
};

const riskVariant: Record<WorkspaceApprovalRisk, "secondary" | "outline" | "destructive"> = {
  low: "secondary",
  medium: "outline",
  high: "destructive",
  critical: "destructive",
};

export function ApprovalDetailPanel({
  approval,
  onApprove,
  onReject,
  onRequestChanges,
  onRevokeTrust,
}: {
  approval: WorkspaceApproval;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
  onRequestChanges?: (approvalId: string) => void;
  onRevokeTrust?: (trustGrantId: string) => void;
}) {
  const pending = approval.status === "pending" || approval.status === "draft";
  const canRevoke = approval.kind === "trust_grant" && approval.status === "approved" && approval.trustGrantId;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{approval.objectName}</CardTitle>
              <CardDescription>
                {approval.kind.replace(/_/g, " ")} · {approval.requestedBy.name} · {formatRelative(approval.requestedAt)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={riskVariant[approval.risk]} className="h-auto min-h-5 py-0.5">{approval.risk}</Badge>
              <Badge variant={approval.status === "approved" ? "secondary" : approval.status === "rejected" || approval.status === "revoked" ? "destructive" : "outline"} className="h-auto min-h-5 py-0.5">
                {statusCopy[approval.status]}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{approval.summary}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <SmallFact label="Required role" value={approval.requiredRole} />
            <SmallFact label="Target" value={approval.rolloutTarget} />
            <SmallFact label="Artifact" value={approval.artifactHash ? approval.artifactHash.replace(/^sha256:/, "").slice(0, 12) : "not applicable"} mono />
            <SmallFact label="Object" value={approval.objectId} mono />
          </div>
          <div className="flex flex-wrap gap-2">
            {pending ? (
              <>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => onApprove?.(approval.id)} data-testid={`approval-approve-${approval.id}`}>
                  <Check data-icon="inline-start" />
                  Approve
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onRequestChanges?.(approval.id)} data-testid={`approval-changes-${approval.id}`}>
                  <Clock data-icon="inline-start" />
                  Request changes
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onReject?.(approval.id)} data-testid={`approval-reject-${approval.id}`}>
                  <X data-icon="inline-start" />
                  Reject
                </Button>
              </>
            ) : null}
            {canRevoke ? (
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onRevokeTrust?.(approval.trustGrantId!)} data-testid={`trust-revoke-${approval.trustGrantId}`}>
                <TriangleAlertIcon data-icon="inline-start" />
                Revoke trust
              </Button>
            ) : null}
            {approval.releaseId ? (
              <Button asChild type="button" size="sm" variant="outline" className="gap-1.5">
                <Link href="/apps" prefetch={false}>
                  <ExternalLink data-icon="inline-start" />
                  App release
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Requested access</CardTitle>
            <CardDescription>Permissions, data, tools, and target scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {approval.requestedAccess.map((item) => (
                <li key={item} className="rounded-lg border p-3 text-sm">{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Runtime units</CardTitle>
            <CardDescription>What basichome will run or install after approval.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {approval.runtimeUnits.map((unit) => (
              <div key={`${unit.kind}-${unit.name}`} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-lg border p-3">
                <Badge variant="outline" className="h-auto min-h-5 justify-center py-0.5">{unit.kind}</Badge>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{unit.name}</div>
                  <div className="truncate text-muted-foreground text-xs">{unit.detail}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Safety checks and diff</CardTitle>
          <CardDescription>Fail-closed policy gates, changed permissions, tests, and rollout risk.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {approval.checks.map((check) => (
              <CheckRow key={check.label} check={check} />
            ))}
          </div>
          <div className="space-y-2">
            {approval.changes.map((change) => (
              <div key={change.label} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{change.label}</div>
                  {change.expandsPermission ? <Badge variant="destructive" className="h-auto min-h-5 py-0.5">Requires admin</Badge> : <Badge variant="secondary" className="h-auto min-h-5 py-0.5">Safe patch</Badge>}
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <SmallFact label="Before" value={change.before} />
                  <SmallFact label="After" value={change.after} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <InfoCard title="Data boundary" detail={approval.dataBoundary} icon={ShieldCheck} />
        <InfoCard title="Cost and limits" detail={approval.costAndLimits} icon={Clock} />
        <InfoCard title="Rollback plan" detail={approval.rollbackPlan} icon={TriangleAlertIcon} />
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Audit trail</CardTitle>
          <CardDescription>Requester, reviewer, policy snapshot, decision, and deployment events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {approval.logs.map((log) => (
            <div key={log.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-sm">{log.event.replace(/_/g, " ")}</div>
                <span className="text-muted-foreground text-xs">{formatRelative(log.createdAt)}</span>
              </div>
              <div className="mt-1 text-muted-foreground text-xs">{log.message}</div>
              <div className="mt-1 font-mono text-muted-foreground text-[11px]">{log.actorRole} · {log.actorAccountId}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CheckRow({ check }: { check: WorkspaceApprovalCheck }) {
  const passed = check.status === "passed";
  const failed = check.status === "failed";
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {passed ? <Check className="size-4 text-emerald-600" /> : failed ? <X className="size-4 text-destructive" /> : <TriangleAlertIcon className="size-4 text-muted-foreground" />}
          <div className="font-medium text-sm">{check.label}</div>
        </div>
        <Badge variant={failed ? "destructive" : passed ? "secondary" : "outline"} className="h-auto min-h-5 py-0.5">
          {check.status.replace(/_/g, " ")}
        </Badge>
      </div>
      <p className="mt-2 text-muted-foreground text-xs">{check.detail}</p>
    </div>
  );
}

function InfoCard({ title, detail, icon: Icon }: { title: string; detail: string; icon: typeof ShieldCheck }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-y-0 border-b">
        <CardTitle className="text-sm">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{detail}</p>
      </CardContent>
    </Card>
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
