import "server-only";

import { cloudGet } from "@/lib/api/cloud";
import type { WorkspaceApproval } from "@/types/approvals";

/**
 * Real approvals read model - backed by the live `pending_approvals` table
 * (the worker writes a row when a tool call pauses for a human decision). The
 * rich WorkspaceApproval UI shape is filled from the leaner real row in the
 * cloud/api route.
 *
 * Reads are scoped to the caller's workspace by the backend via a per-user
 * workspace JWT (cloud/api `GET /v1/pending-approvals`) - no service-role
 * admin client and no hardcoded PRIMARY_WORKSPACE_ID.
 */

export async function getApprovals(): Promise<WorkspaceApproval[]> {
  const { approvals } = await cloudGet<{ approvals: WorkspaceApproval[] }>(
    "/v1/pending-approvals",
    { approvals: [] },
  );
  return approvals;
}
