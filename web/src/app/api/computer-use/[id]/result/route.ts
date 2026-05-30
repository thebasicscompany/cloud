import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Desktop RESULT endpoint — after running the local computer-use loop, the
 * desktop posts the outcome here, flipping the request to done/error. The
 * worker's computer_use tool (polling the row) then returns it to the agent.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { ok?: boolean; text?: string; steps?: number; error?: string; workspaceId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate empty */
  }
  const ws = body.workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const ok = body.ok !== false && !body.error;
  const result = ok
    ? { text: body.text ?? "done", steps: body.steps ?? null }
    : { error: body.error ?? "computer-use failed" };

  const { error } = await supabase
    .from("computer_use_requests")
    .update({ status: ok ? "done" : "error", result, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", ws);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
