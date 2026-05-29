import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import type { WorkspaceApproval } from "@/types/approvals";

/**
 * Real approvals read model — backed by the live `pending_approvals` table
 * (the worker writes a row when a tool call pauses for a human decision). The
 * rich WorkspaceApproval UI shape is filled from the leaner real row with
 * sensible defaults so the existing components render real data. Workspace
 * scoped at the query level.
 */

const DESTRUCTIVE_RE = /_(delete|remove|drop|purge|send|wipe)_|^bash$/i;

function riskFor(action: string): WorkspaceApproval["risk"] {
  return DESTRUCTIVE_RE.test(action) ? "high" : "medium";
}

interface PendingRow {
  id: string;
  agent_run_id: string | null;
  action_name: string | null;
  payload: Record<string, unknown> | null;
  preview_text: string | null;
  created_at: string;
  resolved_at: string | null;
  decided_at: string | null;
  decision: string | null;
  expires_at: string | null;
}

function mapRow(r: PendingRow): WorkspaceApproval {
  const action = r.action_name ?? "agent action";
  const decision = (r.decision ?? "").toLowerCase();
  const expired = r.expires_at ? new Date(r.expires_at).getTime() < Date.now() : false;
  const status: WorkspaceApproval["status"] = decision
    ? decision.startsWith("approve")
      ? "approved"
      : decision.startsWith("reject")
        ? "rejected"
        : decision.includes("change")
          ? "changes_requested"
          : "approved"
    : expired
      ? "expired"
      : "pending";
  // Surface the payload's top-level keys as the "requested access" chips.
  const requestedAccess: string[] = Object.keys(r.payload ?? {}).slice(0, 6);

  return {
    id: r.id,
    kind: "cloud_run",
    status,
    risk: riskFor(action),
    objectName: action,
    reason: r.preview_text ?? `The agent needs approval to run ${action}.`,
    requestedAt: r.created_at,
    resolvedAt: r.resolved_at ?? r.decided_at ?? undefined,
    requestedBy: { id: r.agent_run_id ?? "agent", name: "Agent run", roles: ["device_owner"] },
    requiredRole: "admin",
    rolloutTarget: "cloud",
    requestedAccess,
    checks: [],
    runId: r.agent_run_id ?? undefined,
  } as unknown as WorkspaceApproval;
}

export async function getApprovals(workspaceId?: string): Promise<WorkspaceApproval[]> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("pending_approvals")
    .select("id,agent_run_id,action_name,payload,preview_text,created_at,resolved_at,decided_at,decision,expires_at")
    .eq("workspace_id", ws)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => mapRow(r as PendingRow));
}
