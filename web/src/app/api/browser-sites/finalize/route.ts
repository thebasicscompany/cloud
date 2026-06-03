import { NextResponse } from "next/server";

import { cloudFetch, getWorkspaceId, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finalize a browser-site login: tell the deployed runtime API to stop the
 * Browserbase live-view session (which persists cookies + localStorage back
 * into the Context) and save the workspace_browser_sites row.
 *
 * Bundle-safe: forwards to the runtime API
 *   POST /v1/workspaces/:workspaceId/browser-sites/:host/finalize { sessionId }
 * authed with the signed-in user's WORKSPACE JWT (cloud.ts) - no renderer-side
 * JWT minting. Returns { ok, host, expiresAt }. Cookies are NEVER exposed here.
 */

const HOST_RE = /^[a-z0-9.-]+$/;

export async function POST(req: Request) {
  let body: { host?: unknown; session_id?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty / malformed body
  }

  const host = typeof body.host === "string" ? body.host.trim().toLowerCase() : "";
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";

  if (!host || !HOST_RE.test(host)) {
    return NextResponse.json(
      { error: 'Provide a valid host, e.g. "example.com".' },
      { status: 400 },
    );
  }
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id." }, { status: 400 });
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Sign in to finalize a site login." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await cloudFetch(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/browser-sites/${encodeURIComponent(host)}/finalize`,
      { method: "POST", body: JSON.stringify({ sessionId }) },
    );
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { error: err.status === 401 ? "Sign in to finalize a site login." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ error: "Could not reach the runtime API." }, { status: 502 });
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
