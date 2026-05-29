import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { mintWorkspaceJwt } from "@/lib/workspace-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finalize a browser-site login: tell the deployed runtime API to stop the
 * Browserbase live-view session (which persists cookies + localStorage back
 * into the Context) and save the workspace_browser_sites row.
 *
 * Flow: mint a workspace JWT (server-only) → POST it to
 *   POST /v1/workspaces/:workspaceId/browser-sites/:host/finalize { sessionId }
 * The API expects the camelCase `sessionId` body field and returns
 * { ok, host, expiresAt, sizeBytes }. Cookies are NEVER exposed here.
 */

const HOST_RE = /^[a-z0-9.-]+$/;

function apiBase(): string | undefined {
  const base = process.env.API_BASE_URL;
  const trimmed = typeof base === "string" ? base.trim().replace(/\/+$/, "") : "";
  return trimmed || undefined;
}

export async function POST(req: Request) {
  let body: { host?: unknown; session_id?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty / malformed body
  }

  const host =
    typeof body.host === "string" ? body.host.trim().toLowerCase() : "";
  const sessionId =
    typeof body.session_id === "string" ? body.session_id.trim() : "";
  const workspaceId =
    typeof body.workspaceId === "string" && body.workspaceId
      ? body.workspaceId
      : PRIMARY_WORKSPACE_ID;

  if (!host || !HOST_RE.test(host)) {
    return NextResponse.json(
      { error: "Provide a valid host, e.g. \"example.com\"." },
      { status: 400 },
    );
  }
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing session_id." },
      { status: 400 },
    );
  }

  const base = apiBase();
  if (!base) {
    return NextResponse.json(
      {
        error: "Runtime API is not configured.",
        hint: "Set API_BASE_URL in web/.env.local (server-only).",
      },
      { status: 503 },
    );
  }

  let token: string;
  try {
    token = await mintWorkspaceJwt(workspaceId);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not mint a workspace token.",
        hint: err instanceof Error ? err.message : undefined,
      },
      { status: 503 },
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/browser-sites/${encodeURIComponent(host)}/finalize`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-token": token,
        },
        body: JSON.stringify({ sessionId }),
        cache: "no-store",
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Could not reach the runtime API.",
        hint: err instanceof Error ? err.message : undefined,
      },
      { status: 502 },
    );
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    host?: string;
    expiresAt?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok || !data.ok) {
    return NextResponse.json(
      {
        error: data.error ?? `Runtime API finalize failed (HTTP ${res.status}).`,
        message: data.message,
      },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    host: data.host ?? host,
    expires_at: data.expiresAt ?? null,
  });
}
