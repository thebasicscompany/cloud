"use client";

import Link from "next/link";

import { Check, Clock, ExternalLink, ShieldCheck, TriangleAlertIcon, X } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApprovalActions } from "@/hooks/queries/use-approvals";
import { formatRelative } from "@/lib/format";
import type { WorkspaceApproval } from "@/types/approvals";

export function PendingCard({ approval }: { approval: WorkspaceApproval }) {
  const actions = useApprovalActions();
  // The workspace owner (device owner) is the approver on the local-first
  // product; there's no separate reviewer role to gate on.
  const approveEnabled = true;
  const failedCheck = approval.checks.some((check) => check.status === "failed");
  const pending = approval.status === "pending" || approval.status === "draft";
  const canRevokeTrust = approval.kind === "trust_grant" && approval.status === "approved" && approval.trustGrantId;

  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-auto min-h-5 py-0.5 font-normal">{approval.kind.replace(/_/g, " ")}</Badge>
            <Badge variant={approval.risk === "high" || approval.risk === "critical" ? "destructive" : "secondary"} className="h-auto min-h-5 py-0.5">{approval.risk}</Badge>
            {failedCheck ? <Badge variant="destructive" className="h-auto min-h-5 py-0.5">Check failed</Badge> : null}
          </div>
          <h2 className="mt-2 font-medium text-sm">{approval.objectName}</h2>
          <p className="mt-1 text-muted-foreground text-sm leading-snug">{approval.reason}</p>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          <Clock className="size-3" />
          {formatRelative(approval.requestedAt)}
        </div>
      </header>

      <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-2">
        <Fact label="Requester" value={`${approval.requestedBy.name} (${approval.requestedBy.roles[0]})`} />
        <Fact label="Required" value={approval.requiredRole} />
        <Fact label="Target" value={approval.rolloutTarget} />
        <Fact label="Artifact" value={approval.artifactHash ? approval.artifactHash.replace(/^sha256:/, "").slice(0, 12) : "none"} mono />
      </div>

      <div className="flex flex-wrap gap-1">
        {approval.requestedAccess.slice(0, 3).map((access) => (
          <Badge key={access} variant="outline" className="h-auto min-h-5 py-0.5 font-normal">
            {access}
          </Badge>
        ))}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t pt-3">
        <Link
          href={`/approvals/${approval.id}`}
          prefetch={false}
          className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          <span>Open details</span>
        </Link>
        {pending ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => actions.decide.mutate({ approvalId: approval.id, action: "request_changes", reason: "Admin requested a narrower rollout or clearer test evidence." })}
              data-testid={`approval-card-changes-${approval.id}`}
            >
              <TriangleAlertIcon className="size-3.5" />
              Changes
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => actions.decide.mutate({ approvalId: approval.id, action: "reject", reason: "Rejected from approval queue." })}
              data-testid={`approval-card-reject-${approval.id}`}
            >
              <X className="size-3.5" />
              Reject
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => actions.decide.mutate({ approvalId: approval.id, action: "approve", reason: "Admin approved final rollout; Basics will deploy automatically." })}
              disabled={!approveEnabled}
              data-testid={`approval-card-approve-${approval.id}`}
            >
              {approveEnabled ? <Check className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
              Approve
            </Button>
          </div>
        ) : canRevokeTrust ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => actions.revokeTrust.mutate({ trustGrantId: approval.trustGrantId!, reason: "Revoked from approvals queue." })}
            data-testid={`approval-card-revoke-${approval.trustGrantId}`}
          >
            <TriangleAlertIcon className="size-3.5" />
            Revoke trust
          </Button>
        ) : (
          <Badge variant="outline" className="h-auto min-h-5 py-0.5">
            {approval.status.replace(/_/g, " ")}
          </Badge>
        )}
      </footer>
    </article>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground">{label}</div>
      <div className={mono ? "truncate font-mono" : "truncate font-medium"}>{value}</div>
    </div>
  );
}
