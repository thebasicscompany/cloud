import "server-only";

import { cloudGet } from "@/lib/api/cloud";
import type {
  CloudAutomation,
  CloudAutomationRun,
  CloudAutomationSummary,
} from "@/types/cloud-automation";

/**
 * Real automations read model - now served by `cloud/api` (`/v1/automation-views`),
 * scoped per-user by the workspace JWT exchanged from the caller's Supabase
 * session. The heavy lifting (querying `automations` + `cloud_runs`, computing
 * per-automation run stats, and mapping the rich CloudAutomation UI shape) lives
 * server-side in `api/src/routes/automation-views.ts`.
 *
 * This is the secure replacement for the old service-role admin client +
 * hardcoded PRIMARY_WORKSPACE_ID: each read is scoped to the signed-in user's
 * workspace by the backend, and no service-role key ever touches the renderer.
 */

// The optional `workspaceId` arg is retained for call-site compatibility but is
// now ignored: cloud/api scopes every read to the caller's workspace via the JWT
// it exchanges from the Supabase session (no client-supplied workspace).
export async function getCloudAutomations(_workspaceId?: string): Promise<CloudAutomationSummary[]> {
  const { automations } = await cloudGet<{ automations: CloudAutomationSummary[] }>(
    "/v1/automation-views",
    { automations: [] },
  );
  return automations;
}

export async function getCloudAutomationDetail(
  id: string,
  _workspaceId?: string,
): Promise<{ automation: CloudAutomation; runs: CloudAutomationRun[] } | null> {
  const { detail } = await cloudGet<{
    detail: { automation: CloudAutomation; runs: CloudAutomationRun[] } | null;
  }>(`/v1/automation-views/${id}`, { detail: null });
  return detail;
}
