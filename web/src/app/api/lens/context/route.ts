import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";
import { PRIMARY_ACCOUNT_ID, mintWorkspaceJwt } from "@/lib/workspace-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Identity + endpoints the local Lens daemon needs:
 *  - workspaceId / userId — scope a capture session (`/v1/sessions` requires
 *    both) so capture lands in the right workspace.
 *  - apiBase — where the daemon ships distilled candidates (the desktop sets the
 *    daemon's CADENCE_DISTILL_URL/CADENCE_AGENT_URL to this, so suggestions land
 *    in THIS stack, not the upstream's).
 *  - token — a short-lived workspace JWT the desktop hands to the daemon's
 *    `/v1/sessions/:id/distill` call; the daemon forwards it as bearer to the
 *    API distill endpoint, which verifies it.
 */
export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  let userId = "";
  if (supabase) {
    const { data } = await supabase
      .from("workspace_members")
      .select("account_id,role")
      .eq("workspace_id", ws);
    const rows = data ?? [];
    const owner = rows.find((m) => (m.role as string | null)?.toLowerCase() === "owner");
    userId = (owner?.account_id as string) ?? (rows[0]?.account_id as string) ?? "";
  }

  const apiBase = (process.env.API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  let token = "";
  try {
    token = await mintWorkspaceJwt(ws, userId || PRIMARY_ACCOUNT_ID);
  } catch {
    /* WORKSPACE_JWT_SECRET not set — distill auth will be unavailable, capture still works */
  }

  return NextResponse.json({ workspaceId: ws, userId, apiBase, token, userRole: "pm" });
}
