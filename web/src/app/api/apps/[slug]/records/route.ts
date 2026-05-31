import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Append a record (output) to an app. This is the bidirectional write surface:
 * the user's UI posts here when they add a row, and runs / automations / agents
 * post here to drop their outputs into a typed app (e.g. a GTM run adds a lead
 * to the CRM app). Idempotent when a `dedupKey` is supplied.
 *
 * Repointed to cloud/api `POST /v1/apps/:slug/records` (workspace-scoped by the
 * JWT) — no service-role admin client, no hardcoded workspace. The cloud/api
 * handler owns validation + app resolution + the status contract, so we pass its
 * status and JSON straight through.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // tolerate empty body
  }

  try {
    const res = await cloudFetch(`/v1/apps/${encodeURIComponent(slug)}/records`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => ({}));
    return NextResponse.json(json, { status: res.status });
  } catch (err) {
    const status = err instanceof CloudApiError ? err.status : 503;
    return NextResponse.json({ error: "Backend not connected." }, { status });
  }
}
