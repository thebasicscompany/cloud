import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edit a record's data/status (user interaction). */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; recordId: string }> }) {
  const { recordId } = await params;
  let body: { data?: unknown; status?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty body
  }
  const workspaceId =
    typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : PRIMARY_WORKSPACE_ID;

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Backend not connected." }, { status: 503 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.data && typeof body.data === "object") patch.data = body.data;
  if (typeof body.status === "string") patch.status = body.status;

  const { error } = await supabase
    .from("workspace_app_records")
    .update(patch)
    .eq("id", recordId)
    .eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Delete a record (user interaction). */
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; recordId: string }> }) {
  const { recordId } = await params;
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") || PRIMARY_WORKSPACE_ID;

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Backend not connected." }, { status: 503 });

  const { error } = await supabase
    .from("workspace_app_records")
    .delete()
    .eq("id", recordId)
    .eq("workspace_id", workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
