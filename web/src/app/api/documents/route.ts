import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";
import { getDocuments } from "@/lib/documents-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ documents: await getDocuments() });
}

/**
 * Create a document. Used by the user's "New document" flow and by agents.
 * Repointed to cloud/api `POST /v1/documents` (workspace-scoped by the JWT) - no
 * service-role admin client, no hardcoded workspace. The cloud/api handler owns
 * validation + the success/conflict/error contract, so we pass its status and
 * JSON straight through.
 */
export async function POST(req: Request) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // tolerate empty body
  }

  try {
    const res = await cloudFetch("/v1/documents", {
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
