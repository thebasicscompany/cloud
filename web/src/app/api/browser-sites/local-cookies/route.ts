import { NextResponse } from "next/server";

import { cloudFetch, getWorkspaceId, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save a `storageState` blob (cookies + localStorage) exported from the user's
 * LOCAL Chrome so the cloud agent's browser can reuse that login - the
 * "use my local login in the cloud" path. The desktop app captures cookies via
 * CDP for a single host the user picks (explicit, opt-in) and POSTs them here.
 *
 * Bundle-safe: this forwards to the deployed runtime API
 *   POST /v1/workspaces/:workspaceId/browser-sites/:host/local-cookies
 * authed with the signed-in user's short-lived WORKSPACE JWT (cloud.ts). The
 * runtime upserts the workspace_browser_sites row (service-role, RLS-locked)
 * under the verified workspace, so no service-role client is needed in the
 * renderer. The external contract
 * (`{ ok, host, cookieCount, expires_at }`) is unchanged.
 */
const HOST_RE = /^[a-z0-9.-]+$/;

export async function POST(req: Request) {
  let body: { host?: unknown; cookies?: unknown; origins?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate */
  }

  const host =
    typeof body.host === "string" ? body.host.trim().toLowerCase().replace(/^www\./, "") : "";
  if (!host || !HOST_RE.test(host)) {
    return NextResponse.json({ error: 'Provide a valid host, e.g. "linkedin.com".' }, { status: 400 });
  }
  if (!Array.isArray(body.cookies) || body.cookies.length === 0) {
    return NextResponse.json({ error: "No cookies provided for this host." }, { status: 400 });
  }

  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Sign in to save a local login." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await cloudFetch(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/browser-sites/${encodeURIComponent(host)}/local-cookies`,
      {
        method: "POST",
        body: JSON.stringify({ cookies: body.cookies, origins: body.origins ?? [] }),
      },
    );
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { error: err.status === 401 ? "Sign in to save a local login." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ error: "Could not reach the runtime API." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    host?: string;
    cookieCount?: number;
    expires_at?: string;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return NextResponse.json(
      { error: data.error ?? `Runtime API save failed (HTTP ${res.status}).` },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    host: data.host ?? host,
    cookieCount: data.cookieCount ?? 0,
    expires_at: data.expires_at ?? null,
  });
}
