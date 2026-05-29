import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";
import { triggerCloudRun } from "@/lib/trigger-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run an automation now — triggers a real cloud run executing its goal. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { workspaceId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty */
  }
  const ws = body.workspaceId ?? PRIMARY_WORKSPACE_ID;

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });

  const { data: row } = await supabase
    .from("automations")
    .select("goal")
    .eq("id", id)
    .eq("workspace_id", ws)
    .maybeSingle();
  if (!row?.goal) return NextResponse.json({ ok: false, error: "automation not found" }, { status: 404 });

  const res = await triggerCloudRun({ goal: row.goal as string, workspaceId: ws });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
