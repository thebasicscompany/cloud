import { NextResponse } from "next/server";

import { getWorkspaceToken } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin workspace-token mint for the desktop auth bridge.
 *
 * The desktop renderer in dev (http://localhost:3000) can't call the
 * cross-origin cloud/api `POST /v1/auth/token` directly — CORS blocks it (the
 * api allowlist has the packaged app's `null` origin + the Vite/landing dev
 * ports, but not :3000). This route mints the signed-in user's workspace JWT
 * server-side — the same `getWorkspaceToken()` the local-run trigger uses,
 * reading the Supabase session from cookies — and hands it back same-origin, so
 * `DesktopAuthBridge` can push it to the computer-use + Lens loops. In a
 * packaged build the bridge falls back to the direct cloud/api exchange (its
 * `null` origin is already CORS-allowed), so this route is the dev convenience.
 */
export async function POST() {
  const token = await getWorkspaceToken();
  if (!token) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  return NextResponse.json({ token });
}
