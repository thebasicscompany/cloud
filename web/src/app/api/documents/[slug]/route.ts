import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";
import { getDocument } from "@/lib/documents-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const doc = await getDocument(slug, url.searchParams.get("workspaceId") ?? undefined);
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json({ document: doc });
}

/**
 * Edit a document (user). Repointed to cloud/api `PATCH /v1/documents/:slug`
 * (workspace-scoped by the JWT) — no service-role admin client, no hardcoded
 * workspace. Also covers pin/unpin (`pinned`).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // tolerate empty body
  }

  try {
    const res = await cloudFetch(`/v1/documents/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    const status = err instanceof CloudApiError ? err.status : 503;
    return NextResponse.json({ error: "Backend not connected." }, { status });
  }
}

/**
 * Archive (soft-delete) a document (user). Repointed to cloud/api
 * `DELETE /v1/documents/:slug` (workspace-scoped by the JWT) — no service-role
 * admin client, no hardcoded workspace.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const res = await cloudFetch(`/v1/documents/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    const status = err instanceof CloudApiError ? err.status : 503;
    return NextResponse.json({ error: "Backend not connected." }, { status });
  }
}
