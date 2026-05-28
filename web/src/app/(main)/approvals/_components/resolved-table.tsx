"use client";

import Link from "next/link";

import { Check, Clock, TriangleAlertIcon, X } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isResolvedApproval, useApprovals } from "@/hooks/queries/use-approvals";
import { formatRelative } from "@/lib/format";
import type { WorkspaceApprovalStatus } from "@/types/approvals";

const STATUS_META: Record<
  Exclude<WorkspaceApprovalStatus, "draft" | "pending">,
  { label: string; variant: "secondary" | "destructive" | "outline"; icon: typeof Check }
> = {
  approved: { label: "Approved", variant: "secondary", icon: Check },
  rejected: { label: "Rejected", variant: "destructive", icon: X },
  changes_requested: { label: "Changes", variant: "outline", icon: TriangleAlertIcon },
  expired: { label: "Expired", variant: "outline", icon: Clock },
  revoked: { label: "Revoked", variant: "destructive", icon: X },
};

export function ResolvedTable() {
  const { data, isLoading } = useApprovals();
  const resolved = (data ?? [])
    .filter(isResolvedApproval)
    .slice()
    .sort((a, b) => (b.decidedAt ?? b.requestedAt).localeCompare(a.decidedAt ?? a.requestedAt));

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Outcome</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead className="hidden lg:table-cell">Reason</TableHead>
            <TableHead className="text-right">Resolved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 6 }).map((_x, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : resolved.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm">
                No resolved approvals yet.
              </TableCell>
            </TableRow>
          ) : (
            resolved.map((approval) => {
              const meta = STATUS_META[approval.status as Exclude<WorkspaceApprovalStatus, "draft" | "pending">];
              const Icon = meta.icon;
              return (
                <TableRow key={approval.id}>
                  <TableCell>
                    <Badge variant={meta.variant} className="h-auto min-h-5 gap-1 py-0.5 font-normal [&>svg]:!size-3">
                      <Icon />
                      {meta.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/approvals/${approval.id}`}
                      className="font-medium hover:underline underline-offset-2"
                      prefetch={false}
                    >
                      {approval.objectName}
                    </Link>
                    <div className="font-mono text-muted-foreground text-xs">{approval.id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="h-auto min-h-5 py-0.5 font-normal">
                      {approval.kind.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {approval.decidedBy?.name ?? approval.requestedBy.name}
                  </TableCell>
                  <TableCell className="hidden max-w-[360px] text-muted-foreground text-sm lg:table-cell">
                    <div className="truncate">{approval.decisionReason ?? approval.reason}</div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {formatRelative(approval.decidedAt ?? approval.requestedAt)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
