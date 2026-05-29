import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Append a record (output) to an app. This is the bidirectional write surface:
 * the user's UI posts here when they add a row, and runs / automations / agents
 * post here to drop their outputs into a typed app (e.g. a GTM run adds a lead
 * to the CRM app). Idempotent when a `dedupKey` is supplied.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: {
    data?: unknown;
    status?: unknown;
    dedupKey?: unknown;
    sourceRunId?: unknown;
    sourceAutomationId?: unknown;
    workspaceId?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty body
  }

  const record = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  if (!record) return NextResponse.json({ error: "A `data` object is required." }, { status: 400 });

  const workspaceId =
    typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : PRIMARY_WORKSPACE_ID;

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Backend not connected." }, { status: 503 });

  const { data: app } = await supabase
    .from("workspace_apps")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: `No app "${slug}" in this workspace.` }, { status: 404 });

  const row = {
    app_id: app.id as string,
    workspace_id: workspaceId,
    data: record,
    status: typeof body.status === "string" ? body.status : null,
    dedup_key: typeof body.dedupKey === "string" ? body.dedupKey : null,
    source_run_id: typeof body.sourceRunId === "string" ? body.sourceRunId : null,
    source_automation_id: typeof body.sourceAutomationId === "string" ? body.sourceAutomationId : null,
  };

  // Upsert on (app_id, dedup_key) when a dedup key is provided, else plain insert.
  const query = row.dedup_key
    ? supabase.from("workspace_app_records").upsert(row, { onConflict: "app_id,dedup_key" }).select("id").maybeSingle()
    : supabase.from("workspace_app_records").insert(row).select("id").maybeSingle();

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bump the app's updated_at so it sorts to the top of the list.
  await supabase
    .from("workspace_apps")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", app.id as string);

  return NextResponse.json({ ok: true, id: data?.id });
}
