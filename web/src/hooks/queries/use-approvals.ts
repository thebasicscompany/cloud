"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  WorkspaceApproval,
  WorkspaceApprovalAction,
  WorkspaceApprovalLogEvent,
  WorkspaceApprovalStatus,
  WorkspaceApprovalStore,
} from "@/types/approvals";

export const WORKSPACE_APPROVALS_QUERY_KEY = ["workspace-approvals"];

interface ApprovalsResponse {
  approvals: WorkspaceApproval[];
  trustGrants: WorkspaceApprovalStore["trustGrants"];
}

async function fetchApprovals(): Promise<ApprovalsResponse> {
  const res = await fetch("/api/approvals", { cache: "no-store" });
  if (!res.ok) return { approvals: [], trustGrants: [] };
  const json = (await res.json()) as Partial<ApprovalsResponse>;
  return { approvals: json.approvals ?? [], trustGrants: json.trustGrants ?? [] };
}

/** Real approvals read model (backed by /api/approvals → pending_approvals). */
export function useApprovalStore() {
  return useQuery({
    queryKey: WORKSPACE_APPROVALS_QUERY_KEY,
    queryFn: fetchApprovals,
  });
}

export function useApprovals(filter: { status?: WorkspaceApprovalStatus | "all" } = {}) {
  const query = useApprovalStore();
  const status = filter.status ?? "all";
  const approvals = query.data?.approvals ?? [];
  return {
    ...query,
    data: status === "all" ? approvals : approvals.filter((a) => a.status === status),
  };
}

export function useApproval(approvalId: string | undefined) {
  const query = useApprovalStore();
  return {
    ...query,
    data: approvalId ? (query.data?.approvals ?? []).find((a) => a.id === approvalId) : undefined,
  };
}

export function useApprovalLogs() {
  // No separate audit-log table for approvals yet — the Logs/Audit surface
  // carries the platform event stream. Return empty rather than mock rows.
  const query = useApprovalStore();
  return { ...query, data: [] as WorkspaceApprovalLogEvent[] };
}

export function useApprovalActions() {
  const queryClient = useQueryClient();

  const decide = useMutation({
    mutationFn: async ({
      approvalId,
      action,
      reason,
    }: {
      approvalId: string;
      action: WorkspaceApprovalAction;
      reason?: string;
    }) => {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "decision failed");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_APPROVALS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  // Trust-grant revocation is not yet a standalone real surface; resolving the
  // backing approval (reject) is the real action. Kept as a no-op-ish mutation
  // so callers don't break, invalidating the queue afterward.
  const revokeTrust = useMutation({
    mutationFn: async ({ trustGrantId, reason }: { trustGrantId: string; reason?: string }) => {
      const res = await fetch(`/api/approvals/${trustGrantId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revoke", reason }),
      });
      return res.ok ? res.json() : { ok: false };
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: WORKSPACE_APPROVALS_QUERY_KEY }),
  });

  return { decide, revokeTrust };
}

export function isPendingApproval(approval: WorkspaceApproval): boolean {
  return approval.status === "draft" || approval.status === "pending";
}

export function isResolvedApproval(approval: WorkspaceApproval): boolean {
  return !isPendingApproval(approval);
}

export function approvalLogToMessage(log: WorkspaceApprovalLogEvent): string {
  return `${log.event}: ${log.message}`;
}
