import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Desktop CLAIM endpoint for delegated computer-use. The user's desktop polls
 * this while a local run is active; it atomically claims the oldest pending
 * request for the workspace (pending → running) and returns it, so the desktop
 * can run the local eyes→brain→hands loop and post the result back. Returns
 * { request: null } when there's nothing to do.
 */
export async function POST(req: Request) {
  let body: { workspaceId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate empty */
  }
  const ws = body.workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  // Oldest pending request for this workspace.
  const { data: pending } = await supabase
    .from("computer_use_requests")
    .select("id,task,run_id")
    .eq("workspace_id", ws)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!pending) return NextResponse.json({ request: null });

  // Claim it (only if still pending — avoids two desktops double-claiming).
  const { data: claimed } = await supabase
    .from("computer_use_requests")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("id,task,run_id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ request: null });

  return NextResponse.json({ request: { id: claimed.id, task: claimed.task, runId: claimed.run_id } });
}
