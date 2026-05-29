import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Decide a pending approval. Writes `decision` + `resolved_at` on the real
 * `pending_approvals` row; the worker's approval gate polls that row and
 * resumes (approve) or aborts (anything else) the paused tool call within
 * its poll interval (~2s). Workspace-scoped.
 */
const ACTION_TO_DECISION: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
  revoke: "rejected",
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { action?: unknown; reason?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body ok */
  }

  const action = typeof body.action === "string" ? body.action : "";
  const decision = ACTION_TO_DECISION[action];
  if (!decision) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason : null;
  const ws = typeof body.workspaceId === "string" ? body.workspaceId : PRIMARY_WORKSPACE_ID;

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data, error } = await supabase
    .from("pending_approvals")
    .update({
      decision,
      decision_payload: reason ? { reason } : null,
      resolved_at: new Date().toISOString(),
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("workspace_id", ws)
    .is("resolved_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found or already resolved" }, { status: 404 });
  return NextResponse.json({ ok: true, id, decision });
}
