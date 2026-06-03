import { NextResponse } from "next/server";

import { cloudFetch, getWorkspaceId, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete a saved browser login (storage state) for a host so the user stays in
 * control of what the agent can reuse.
 *
 * Bundle-safe: forwards to the runtime API
 *   DELETE /v1/workspaces/:workspaceId/browser-sites/:host
 * authed with the signed-in user's WORKSPACE JWT (cloud.ts) - no renderer-side
 * JWT minting. The stored cookies are removed at the DB level by the runtime;
 * no secret material is ever returned here.
 */

const HOST_RE = /^[a-z0-9.-]+$/;

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host: rawHost } = await params;
  const host = (rawHost ?? "").trim().toLowerCase();

  if (!host || !HOST_RE.test(host)) {
    return NextResponse.json({ error: "Provide a valid host." }, { status: 400 });
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Sign in to remove a saved login." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await cloudFetch(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/browser-sites/${encodeURIComponent(host)}`,
      { method: "DELETE" },
    );
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { error: err.status === 401 ? "Sign in to remove a saved login." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ error: "Could not reach the runtime API." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as { deleted?: boolean; error?: string };
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error ?? `Delete failed (HTTP ${res.status}).` },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }
  return NextResponse.json({ ok: true, deleted: data.deleted ?? true, host });
}
