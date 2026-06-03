import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/:id/rename  { name }
 *
 * Forwards to cloud/api `POST /v1/team/workspaces/:id/rename`. The runtime
 * verifies the caller is an owner/admin on the target workspace before
 * accepting the rename.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let name: unknown;
  try {
    ({ name } = (await req.json()) as { name?: unknown });
  } catch {
    name = undefined;
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ ok: false, error: "Name required." }, { status: 400 });
  }
  let res: Response;
  try {
    res = await cloudFetch(`/v1/team/workspaces/${encodeURIComponent(id)}/rename`, {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { ok: false, error: err.status === 401 ? "Sign in to rename." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "Could not reach the runtime API." }, { status: 502 });
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; name?: string };
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: data.error ?? `Rename failed (HTTP ${res.status}).` },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }
  return NextResponse.json({ ok: true, name: data.name ?? name.trim() });
}
