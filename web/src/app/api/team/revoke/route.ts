import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";

/**
 * Revoke a pending workspace invitation.
 *
 * Bundle-safe: this proxies the deployed runtime API
 *   POST /v1/team/revoke { id }
 * authed with the signed-in user's WORKSPACE JWT (cloud.ts). The runtime scopes
 * the revoke to the verified workspace (so a leaked id can't revoke another
 * workspace's invite), removing the need for a service-role client in the
 * renderer. The external contract (`{ ok, error }`) is unchanged.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await cloudFetch("/v1/team/revoke", {
      method: "POST",
      body: JSON.stringify({ id: body.id }),
    });
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { ok: false, error: err.status === 401 ? "Sign in to revoke invites." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "Could not reach the runtime API." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  return NextResponse.json(data, { status: res.ok && data.ok ? 200 : res.status >= 400 ? res.status : 400 });
}
