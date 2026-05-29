import { NextResponse } from "next/server";

import { getDocuments } from "@/lib/documents-data";
import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export async function GET() {
  return NextResponse.json({ documents: await getDocuments() });
}

/** Create a document. Used by the user's "New document" flow and by agents. */
export async function POST(req: Request) {
  let body: {
    title?: unknown;
    slug?: unknown;
    summary?: unknown;
    icon?: unknown;
    body?: unknown;
    workspaceId?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty body
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  const slug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(title);
  if (!slug) return NextResponse.json({ error: "Could not derive a slug." }, { status: 400 });
  const workspaceId =
    typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : PRIMARY_WORKSPACE_ID;

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Backend not connected." }, { status: 503 });

  const { data, error } = await supabase
    .from("workspace_documents")
    .insert({
      workspace_id: workspaceId,
      slug,
      title,
      summary: typeof body.summary === "string" ? body.summary : "",
      icon: typeof body.icon === "string" ? body.icon : "document",
      body: typeof body.body === "string" ? body.body : "",
      status: "draft",
    })
    .select("id,slug")
    .maybeSingle();
  if (error) {
    const conflict = error.code === "23505";
    return NextResponse.json(
      { error: conflict ? `A document "${slug}" already exists.` : error.message },
      { status: conflict ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, id: data?.id, slug: data?.slug ?? slug });
}
