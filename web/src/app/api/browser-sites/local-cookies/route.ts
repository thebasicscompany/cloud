import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save a `storageState` blob (cookies + localStorage) exported from the user's
 * LOCAL Chrome so the cloud agent's browser can reuse that login — the
 * "use my local login in the cloud" path. The desktop app captures cookies via
 * CDP for a single host the user picks (explicit, opt-in) and POSTs them here;
 * the worker's goto_url applies them via Network.setCookies on navigation.
 *
 * Stored workspace-scoped in `workspace_browser_sites` (service-role, RLS-locked),
 * same table + protections as the cloud live-view sign-in flow.
 */
const HOST_RE = /^[a-z0-9.-]+$/;

interface IncomingCookie {
  name?: unknown;
  value?: unknown;
  domain?: unknown;
  path?: unknown;
  expires?: unknown;
  httpOnly?: unknown;
  secure?: unknown;
  sameSite?: unknown;
}

export async function POST(req: Request) {
  let body: { host?: unknown; cookies?: unknown; origins?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate */
  }

  const host = typeof body.host === "string" ? body.host.trim().toLowerCase().replace(/^www\./, "") : "";
  if (!host || !HOST_RE.test(host)) {
    return NextResponse.json({ error: 'Provide a valid host, e.g. "linkedin.com".' }, { status: 400 });
  }
  if (!Array.isArray(body.cookies) || body.cookies.length === 0) {
    return NextResponse.json({ error: "No cookies provided for this host." }, { status: 400 });
  }
  const workspaceId = typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : PRIMARY_WORKSPACE_ID;

  // Normalize to the Playwright storageState cookie shape the worker expects.
  const cookies = (body.cookies as IncomingCookie[])
    .filter((c) => typeof c?.name === "string" && typeof c?.value === "string")
    .map((c) => ({
      name: String(c.name),
      value: String(c.value),
      domain: typeof c.domain === "string" ? c.domain : undefined,
      path: typeof c.path === "string" ? c.path : "/",
      expires: typeof c.expires === "number" ? c.expires : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: typeof c.sameSite === "string" ? c.sameSite : undefined,
    }));
  const origins = Array.isArray(body.origins) ? body.origins : [];

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("workspace_browser_sites").upsert(
    {
      workspace_id: workspaceId,
      host,
      display_name: host,
      storage_state_json: { kind: "storageState", cookies, origins },
      captured_via: "sync_local_profile",
      last_verified_at: nowIso,
      expires_at: expiresIso,
      updated_at: nowIso,
    },
    { onConflict: "workspace_id,host" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, host, cookieCount: cookies.length, expires_at: expiresIso });
}
