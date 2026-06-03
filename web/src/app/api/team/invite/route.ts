import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";

/**
 * Invite a teammate to the signed-in user's workspace.
 *
 * Bundle-safe: this proxies the deployed runtime API
 *   POST /v1/team/invite { email, role, workspaceName }
 * authed with the user's short-lived WORKSPACE JWT (cloud.ts). The runtime
 * creates the workspace_invitations row under the verified workspace AND sends
 * the invite email server-side (cloud/api owns the SES creds - the renderer
 * must not). The legacy `workspaceId` body field is accepted for compatibility
 * but ignored: the JWT is the source of truth.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { workspaceId?: string; email?: string; role?: string; workspaceName?: string }
    | null;
  if (!body?.email) {
    return NextResponse.json({ ok: false, error: "workspaceId and email are required." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await cloudFetch("/v1/team/invite", {
      method: "POST",
      body: JSON.stringify({
        email: body.email,
        role: body.role,
        workspaceName: body.workspaceName,
      }),
    });
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { ok: false, error: err.status === 401 ? "Sign in to invite teammates." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "Could not reach the runtime API." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    invitation?: unknown;
    acceptUrl?: string;
    emailed?: boolean;
    emailMessageId?: string;
    emailError?: string;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return NextResponse.json(
      { ok: false, error: data.error ?? "Could not create invitation." },
      { status: res.status >= 400 ? res.status : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    invitation: data.invitation,
    acceptUrl: data.acceptUrl,
    emailed: data.emailed,
    emailMessageId: data.emailMessageId,
    emailError: data.emailError,
  });
}
