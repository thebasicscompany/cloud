import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { mintWorkspaceJwt } from "@/lib/workspace-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a Browserbase live-view session so the operator can sign in to a site
 * once; the deployed runtime API captures the resulting cookies into a
 * Browserbase Context on finalize.
 *
 * Flow: mint a workspace JWT (HS256, server-only) → POST it to the deployed
 *   POST /v1/workspaces/:workspaceId/browser-sites/:host/connect
 * The API returns camelCase { sessionId, liveViewUrl, host, expiresAt } with a
 * 201. We re-expose it under the snake_case shape the client expects
 * (session_id, live_view_url, expires_at). Cookies are NEVER exposed here.
 */

const HOST_RE = /^[a-z0-9.-]+$/;

function apiBase(): string | undefined {
  const base = process.env.API_BASE_URL;
  const trimmed = typeof base === "string" ? base.trim().replace(/\/+$/, "") : "";
  return trimmed || undefined;
}

export async function POST(req: Request) {
  let body: { host?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty / malformed body
  }

  const host =
    typeof body.host === "string" ? body.host.trim().toLowerCase() : "";
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
      `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/browser-sites/${encodeURIComponent(host)}/connect`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-token": token,
        },
        body: JSON.stringify({}),
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
    sessionId?: string;
    liveViewUrl?: string;
    host?: string;
    expiresAt?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok || !data.sessionId || !data.liveViewUrl) {
    return NextResponse.json(
      {
        error: data.error ?? `Runtime API connect failed (HTTP ${res.status}).`,
        message: data.message,
      },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  return NextResponse.json({
    session_id: data.sessionId,
    live_view_url: data.liveViewUrl,
    host: data.host ?? host,
    expires_at: data.expiresAt ?? null,
  });
}
