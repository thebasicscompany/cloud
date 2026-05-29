import { NextResponse } from "next/server";

import { getApps, type AppField } from "@/lib/apps-data";
import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9-]+$/;
const KINDS = new Set(["table", "board", "list"]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function GET() {
  const apps = await getApps();
  return NextResponse.json({ apps });
}

/** Create a new app (data surface). Used by the user's "New app" flow and by agents. */
export async function POST(req: Request) {
  let body: {
    name?: unknown;
    slug?: unknown;
    description?: unknown;
    icon?: unknown;
    kind?: unknown;
    fields?: unknown;
    view?: unknown;
    workspaceId?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty body
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

  const slug = typeof body.slug === "string" && body.slug.trim() ? slugify(body.slug) : slugify(name);
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Could not derive a valid slug from the name." }, { status: 400 });
  }

  const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : "table";
  const fields: AppField[] = Array.isArray(body.fields)
    ? (body.fields as AppField[])
        .filter((f) => f && typeof f === "object" && typeof f.key === "string" && f.key)
        .map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type ?? "text" }))
    : [];
  const view = body.view && typeof body.view === "object" ? body.view : {};
  const workspaceId =
    typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : PRIMARY_WORKSPACE_ID;

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Backend not connected." }, { status: 503 });

  const { data, error } = await supabase
    .from("workspace_apps")
    .insert({
      workspace_id: workspaceId,
      slug,
      name,
      description: typeof body.description === "string" ? body.description : "",
      icon: typeof body.icon === "string" ? body.icon : null,
      kind,
      fields,
      view,
    })
    .select("id,slug")
    .maybeSingle();

  if (error) {
    const conflict = error.code === "23505";
    return NextResponse.json(
      { error: conflict ? `An app named "${slug}" already exists.` : error.message },
      { status: conflict ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data?.id, slug: data?.slug ?? slug });
}
