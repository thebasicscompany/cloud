import { NextResponse } from "next/server";

import { getWorkspaceToken } from "@/lib/api/cloud";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin workspace-token mint for the desktop auth bridge.
 *
 * The desktop renderer in dev (http://localhost:3000) can't call the
 * cross-origin cloud/api `POST /v1/auth/token` directly - CORS blocks it (the
 * api allowlist has the packaged app's `null` origin + the Vite/landing dev
 * ports, but not :3000). This route mints the signed-in user's workspace JWT
 * server-side - the same `getWorkspaceToken()` the local-run trigger uses,
 * reading the Supabase session from cookies - and hands it back same-origin, so
 * `DesktopAuthBridge` can push it to the computer-use + Lens loops. In a
 * packaged build the bridge falls back to the direct cloud/api exchange (its
 * `null` origin is already CORS-allowed), so this route is the dev convenience.
 */
export async function POST() {
  const token = await getWorkspaceToken();
  if (!token) {
    // Diagnostic: getWorkspaceToken silently returns "" for several distinct
    // failure modes. Probe each so the dev console shows which one actually hit.
    const supabase = await createClient();
    const { data: sessionData, error: sErr } = await supabase.auth.getSession();
    const session = sessionData.session;
    const apiBase = (process.env.API_BASE_URL ?? "").trim();
    let mintStatus = "skipped (no api base or no session)";
    if (apiBase && session?.access_token) {
      try {
        const r = await fetch(`${apiBase.replace(/\/+$/, "")}/v1/auth/token`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ supabase_access_token: session.access_token }),
          cache: "no-store",
        });
        const body = await r.text();
        mintStatus = `${r.status} ${body.slice(0, 200)}`;
      } catch (e) {
        mintStatus = `threw: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    console.warn("[desktop-token] 401 diagnostic", {
      apiBaseSet: Boolean(apiBase),
      hasSession: Boolean(session),
      sessionErr: sErr?.message,
      accessTokenLen: session?.access_token?.length ?? 0,
      mintStatus,
    });
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }
  return NextResponse.json({ token });
}
