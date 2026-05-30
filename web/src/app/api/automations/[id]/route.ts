import { NextResponse } from "next/server";

import { getCloudAutomationDetail } from "@/lib/automations-data";
import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const detail = await getCloudAutomationDetail(id, ws);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * Real automation mutations against the `automations` table:
 *  - pause/resume → status
 *  - updateSchedule → triggers jsonb (the schedule entry's cron/timezone)
 *  - grantTrust/revokeTrust → approval_policy.mode (autonomy)
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { action?: string; cron?: string; timezone?: string; target?: string; workspaceId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty */
  }
  const ws = body.workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const { data: current } = await supabase
    .from("automations")
    .select("id,status,triggers,approval_policy")
    .eq("id", id)
    .eq("workspace_id", ws)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  switch (body.action) {
    case "pause":
      patch.status = "paused";
      break;
    case "resume":
      patch.status = "active";
      break;
    case "grantTrust":
      patch.approval_policy = { ...(current.approval_policy as object), mode: "trusted_autonomous" };
      break;
    case "revokeTrust":
      patch.approval_policy = { ...(current.approval_policy as object), mode: "manual_review" };
      break;
    case "updateSchedule": {
      const triggers = Array.isArray(current.triggers) ? [...(current.triggers as Record<string, unknown>[])] : [];
      const idx = triggers.findIndex((t) => t?.type === "schedule");
      const entry = { type: "schedule", cron: body.cron ?? "", timezone: body.timezone ?? "UTC" };
      if (idx >= 0) triggers[idx] = { ...triggers[idx], ...entry };
      else triggers.push(entry);
      patch.triggers = triggers;
      break;
    }
    case "setRunTarget":
      patch.run_target = body.target === "local" ? "local" : "cloud";
      break;
    default:
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const { error } = await supabase.from("automations").update(patch).eq("id", id).eq("workspace_id", ws);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, action: body.action });
}
