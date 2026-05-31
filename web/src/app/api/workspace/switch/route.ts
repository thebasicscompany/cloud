import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { WORKSPACE_COOKIE } from "@/lib/api/cloud";

/**
 * POST /api/workspace/switch  { workspaceId }
 *
 * Persists the user's selected workspace in an httpOnly cookie. The next render's
 * `getWorkspaceToken()` reads it and mints a JWT scoped to that workspace (the
 * cloud/api `/v1/auth/token` endpoint re-verifies the caller's seat, so a forged
 * id can't escalate). The switcher only ever offers workspaces the user is a
 * member of, so no membership check is needed here.
 */
export async function POST(req: Request) {
  let workspaceId: unknown;
  try {
    ({ workspaceId } = (await req.json()) as { workspaceId?: unknown });
  } catch {
    workspaceId = undefined;
  }
  if (typeof workspaceId !== "string" || !workspaceId) {
    return NextResponse.json({ ok: false, error: "workspaceId required" }, { status: 400 });
  }
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true });
}
