import { NextResponse } from "next/server";

import { getDocument } from "@/lib/documents-data";
import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const doc = await getDocument(slug, url.searchParams.get("workspaceId") ?? undefined);
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json({ document: doc });
}

/** Edit a document (user). */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: { title?: unknown; summary?: unknown; body?: unknown; status?: unknown; pinned?: unknown; workspaceId?: unknown } = {};
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
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.summary === "string") patch.summary = body.summary;
  if (typeof body.body === "string") patch.body = body.body;
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;

  const { error } = await supabase
    .from("workspace_documents")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Archive (soft-delete) a document (user). */
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") || PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Backend not connected." }, { status: 503 });
  const { error } = await supabase
    .from("workspace_documents")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
