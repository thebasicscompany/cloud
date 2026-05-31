import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edit a record's data/status (user interaction). Repointed to cloud/api
 * `PATCH /v1/apps/:slug/records/:recordId` (workspace-scoped by the JWT) — no
 * service-role admin client, no hardcoded workspace.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; recordId: string }> }) {
  const { slug, recordId } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // tolerate empty body
  }

  try {
    const res = await cloudFetch(
      `/v1/apps/${encodeURIComponent(slug)}/records/${encodeURIComponent(recordId)}`,
      { method: "PATCH", body: JSON.stringify(body ?? {}) },
    );
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    const status = err instanceof CloudApiError ? err.status : 503;
    return NextResponse.json({ error: "Backend not connected." }, { status });
  }
}

/**
 * Delete a record (user interaction). Repointed to cloud/api
 * `DELETE /v1/apps/:slug/records/:recordId` (workspace-scoped by the JWT) — no
 * service-role admin client, no hardcoded workspace.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; recordId: string }> }) {
  const { slug, recordId } = await params;

  try {
    const res = await cloudFetch(
      `/v1/apps/${encodeURIComponent(slug)}/records/${encodeURIComponent(recordId)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    const status = err instanceof CloudApiError ? err.status : 503;
    return NextResponse.json({ error: "Backend not connected." }, { status });
  }
}
