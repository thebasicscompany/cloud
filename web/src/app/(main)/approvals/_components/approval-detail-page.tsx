"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApproval, useApprovalActions } from "@/hooks/queries/use-approvals";

import { ApprovalDetailPanel } from "./approval-detail-panel";

export function ApprovalDetailPage({ approvalId }: { approvalId: string }) {
  const { data: approval, isLoading } = useApproval(approvalId);
  const actions = useApprovalActions();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    );
  }

  if (!approval) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="font-medium text-sm">Approval not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/approvals" prefetch={false}>Back to approvals</Link>
        </Button>
      </div>
    );
  }

  return (
    <ApprovalDetailPanel
      approval={approval}
      onApprove={(id) => actions.decide.mutate({ approvalId: id, action: "approve", reason: "Admin approved final rollout; Basics will deploy automatically." })}
      onReject={(id) => actions.decide.mutate({ approvalId: id, action: "reject", reason: "Rejected from approval detail." })}
      onRequestChanges={(id) => actions.decide.mutate({ approvalId: id, action: "request_changes", reason: "Admin requested changes from approval detail." })}
      onRevokeTrust={(trustGrantId) => actions.revokeTrust.mutate({ trustGrantId, reason: "Revoked from approval detail." })}
    />
  );
}
