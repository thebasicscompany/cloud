import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { mintWorkspaceJwt } from "@/lib/workspace-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete a saved browser login (storage state) for a host so the user stays in
 * control of what the agent can reuse. Proxies the deployed runtime API's
 *   DELETE /v1/workspaces/:workspaceId/browser-sites/:host
 * with a server-minted workspace JWT. The stored cookies are removed at the DB
 * level by the runtime; no secret material is ever returned here.
 */

const HOST_RE = /^[a-z0-9.-]+$/;

function apiBase(): string | undefined {
  const base = process.env.API_BASE_URL;
  const trimmed = typeof base === "string" ? base.trim().replace(/\/+$/, "") : "";
  return trimmed || undefined;
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ host: string }> },
) {
  const { host: rawHost } = await params;
  const host = (rawHost ?? "").trim().toLowerCase();
  const workspaceId = new URL(req.url).searchParams.get("ws") || PRIMARY_WORKSPACE_ID;

  if (!host || !HOST_RE.test(host)) {
    return NextResponse.json({ error: "Provide a valid host." }, { status: 400 });
  }

  const base = apiBase();
  if (!base) {
    return NextResponse.json(
      { error: "Runtime API is not configured.", hint: "Set API_BASE_URL in web/.env.local." },
      { status: 503 },
    );
  }

  let token: string;
  try {
    token = await mintWorkspaceJwt(workspaceId);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not mint a workspace token.", hint: err instanceof Error ? err.message : undefined },
      { status: 503 },
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/browser-sites/${encodeURIComponent(host)}`,
      { method: "DELETE", headers: { "x-workspace-token": token }, cache: "no-store" },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Could not reach the runtime API.", hint: err instanceof Error ? err.message : undefined },
      { status: 502 },
    );
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
