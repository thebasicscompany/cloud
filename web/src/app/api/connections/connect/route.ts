import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Initiate (or re-initiate) a Composio connection for a toolkit so the user can
 * connect / reconnect it from the app (e.g. the expired Gmail toolkit).
 *
 * Bundle-safe: this proxies the deployed runtime API
 *   POST /v1/skills/composio/connect-toolkit { toolkit }
 * authed with the signed-in user's short-lived WORKSPACE JWT (cloud.ts). The
 * runtime resolves the toolkit's auth config + mints the OAuth link under the
 * worker's Composio user_id, so no Composio API key or service-role client is
 * ever needed in the renderer. The external contract (request body `toolkit`,
 * response `{ ok, toolkit, redirectUrl, connectedAccountId }`) is unchanged.
 */
export async function POST(req: Request) {
  let body: { toolkit?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty / malformed body
  }

  const toolkit = typeof body.toolkit === "string" ? body.toolkit.trim().toLowerCase() : "";
  if (!toolkit) {
    return NextResponse.json({ ok: false, error: "Missing 'toolkit' in request body." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await cloudFetch("/v1/skills/composio/connect-toolkit", {
      method: "POST",
      body: JSON.stringify({ toolkit }),
    });
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { ok: false, error: err.status === 401 ? "Sign in to connect a toolkit." : err.message },
        { status: err.status },
      );
    }
    return NextResponse.json({ ok: false, error: "Could not reach the runtime API." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    toolkit?: string;
    redirectUrl?: string;
    connectedAccountId?: string | null;
    error?: string;
    hint?: string;
    capability?: string;
  };

  if (!res.ok || !data.ok || !data.redirectUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          data.error ??
          (data.capability === "composio"
            ? "Composio is not configured."
            : `Runtime API connect failed (HTTP ${res.status}).`),
        hint: data.hint,
      },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    toolkit: data.toolkit ?? toolkit,
    redirectUrl: data.redirectUrl,
    connectedAccountId: data.connectedAccountId ?? null,
  });
}
