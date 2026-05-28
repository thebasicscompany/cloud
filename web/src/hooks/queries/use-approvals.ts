"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  decideApproval,
  findApproval,
  listApprovals,
  markApprovalDeployed,
  readApprovalStore,
  revokeTrustGrant,
  writeApprovalStore,
} from "@/lib/admin-approvals-runtime";
import {
  approveWorkspaceAppRelease,
  deployWorkspaceAppRelease,
  readWorkspaceAppsStore,
  writeWorkspaceAppsStore,
} from "@/lib/workspace-apps-runtime";
import type {
  WorkspaceApproval,
  WorkspaceApprovalAction,
  WorkspaceApprovalLogEvent,
  WorkspaceApprovalStatus,
  WorkspaceApprovalStore,
} from "@/types/approvals";

export const WORKSPACE_APPROVALS_QUERY_KEY = ["workspace-approvals"];

export function useApprovalStore() {
  return useQuery({
    queryKey: WORKSPACE_APPROVALS_QUERY_KEY,
    queryFn: async (): Promise<WorkspaceApprovalStore> => {
      await delay();
      return readApprovalStore();
    },
  });
}

export function useApprovals(filter: { status?: WorkspaceApprovalStatus | "all" } = {}) {
  const query = useApprovalStore();
  return {
    ...query,
    data: query.data ? listApprovals(query.data, filter.status ?? "all") : [],
  };
}

export function useApproval(approvalId: string | undefined) {
  const query = useApprovalStore();
  return {
    ...query,
    data: query.data && approvalId ? findApproval(query.data, approvalId) : undefined,
  };
}

export function useApprovalLogs() {
  const query = useApprovalStore();
  return {
    ...query,
    data: query.data ? query.data.logs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [],
  };
}

export function useApprovalActions() {
  const queryClient = useQueryClient();

  const updateStore = (updater: (store: WorkspaceApprovalStore) => WorkspaceApprovalStore) => {
    const current = readApprovalStore();
    const next = writeApprovalStore(updater(current));
    queryClient.setQueryData(WORKSPACE_APPROVALS_QUERY_KEY, next);
    void queryClient.invalidateQueries({ queryKey: ["runs"] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-apps"] });
    return next;
  };

  const decide = useMutation({
    mutationFn: async ({ approvalId, action, reason }: { approvalId: string; action: WorkspaceApprovalAction; reason?: string }) => {
      const before = readApprovalStore();
      const approval = findApproval(before, approvalId);
      const next = updateStore((store) => decideApproval(store, approvalId, action, reason));

      if (action === "approve" && approval?.releaseId && (approval.kind === "app_release" || approval.kind === "app_update")) {
        const currentApps = readWorkspaceAppsStore();
        const approvedApps = approveWorkspaceAppRelease(currentApps, approval.releaseId);
        const deployedApps = deployWorkspaceAppRelease(approvedApps, approval.releaseId);
        writeWorkspaceAppsStore(deployedApps);
        updateStore((store) => markApprovalDeployed(store, approvalId));
        void queryClient.invalidateQueries({ queryKey: ["workspace-apps"] });
        void queryClient.invalidateQueries({ queryKey: ["apps"] });
      }

      return next;
    },
  });

  const revokeTrust = useMutation({
    mutationFn: async ({ trustGrantId, reason }: { trustGrantId: string; reason?: string }) =>
      updateStore((store) => revokeTrustGrant(store, trustGrantId, reason)),
  });

  return {
    decide,
    revokeTrust,
  };
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

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
}
