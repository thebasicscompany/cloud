import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";

/**
 * Accept a workspace invitation by token.
 *
 * Bundle-safe: this proxies the deployed runtime API
 *   POST /v1/team/accept { token }
 * authed with the signed-in user's WORKSPACE JWT (cloud.ts). The runtime
 * find-or-creates the account for the invite's email and adds the member to the
 * invite's OWN workspace, so no service-role client is needed in the renderer.
 * The external contract (`{ ok, workspaceId, workspaceName, error }`) is
 * unchanged.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) {
    return NextResponse.json({ ok: false, error: "token is required." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await cloudFetch("/v1/team/accept", {
      method: "POST",
      body: JSON.stringify({ token: body.token }),
    });
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { ok: false, error: err.status === 401 ? "Sign in to accept this invite." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "Could not reach the runtime API." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    workspaceId?: string;
    workspaceName?: string;
    error?: string;
  };
  return NextResponse.json(data, { status: res.ok && data.ok ? 200 : res.status >= 400 ? res.status : 400 });
}
