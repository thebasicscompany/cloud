import { NextResponse } from "next/server";

import { cloudFetch, getWorkspaceId, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start a Browserbase live-view session so the operator can sign in to a site
 * once; the deployed runtime API captures the resulting cookies into a
 * Browserbase Context on finalize.
 *
 * Bundle-safe: forwards to the runtime API
 *   POST /v1/workspaces/:workspaceId/browser-sites/:host/connect
 * authed with the signed-in user's WORKSPACE JWT (cloud.ts) — no renderer-side
 * JWT minting. The API returns camelCase { sessionId, liveViewUrl, host,
 * expiresAt }; we re-expose it under the snake_case shape the client expects
 * (session_id, live_view_url, expires_at). Cookies are NEVER exposed here.
 */

const HOST_RE = /^[a-z0-9.-]+$/;

export async function POST(req: Request) {
  let body: { host?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty / malformed body
  }

  const host = typeof body.host === "string" ? body.host.trim().toLowerCase() : "";
  if (!host || !HOST_RE.test(host)) {
    return NextResponse.json(
      { error: 'Provide a valid host, e.g. "example.com".' },
      { status: 400 },
    );
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Sign in to connect a site." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await cloudFetch(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/browser-sites/${encodeURIComponent(host)}/connect`,
      { method: "POST", body: JSON.stringify({}) },
    );
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { error: err.status === 401 ? "Sign in to connect a site." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ error: "Could not reach the runtime API." }, { status: 502 });
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
