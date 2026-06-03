import { NextResponse } from "next/server";

import { setSuggestionStatus } from "@/lib/suggestions-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Update a suggestion's state. "dismissed" hides it for good (the run-history
 * generator won't resurrect it); "accepted" records that the user chose to
 * build it (the actual build is driven client-side via the routine handoff).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { status?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate empty body - defaults to dismissed */
  }
  const status = body.status === "accepted" ? "accepted" : "dismissed";
  const ok = await setSuggestionStatus(id, status);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
