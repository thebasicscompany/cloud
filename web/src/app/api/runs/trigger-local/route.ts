import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { cloudFetch, getWorkspaceToken } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Model B — "Run on my computer". Two-step so the desktop bridge is up before
 * the worker connects:
 *
 *  1) POST { goal } (no session)  → return { session, token, relayUrl }. The
 *     token is the caller's per-user workspace JWT (exchanged from their Supabase
 *     session by cloud/api `POST /v1/auth/token` — NOT minted locally, so no
 *     JWT-signing secret lives in the renderer). The renderer then calls
 *     window.basichome.localRelayStart({relayUrl, session, token}) to bridge the
 *     user's local Chrome into the relay.
 *  2) POST { goal, session }      → dispatch the cloud run via cloud/api
 *     `POST /v1/runs` with browser_target='local_relay' + relay_session +
 *     ephemeral, so the worker attaches its CDP to the relay (the user's Chrome)
 *     instead of Browserbase. No service-role admin client, no local Lambda
 *     invoke — cloud/api writes the routing onto the run row at dispatch time.
 *
 * The relay endpoint is read from RELAY_WS_URL (server config, not a secret) —
 * when unset, local runs are not available and we say so.
 */
export async function POST(req: Request) {
  let body: { goal?: unknown; session?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty body
  }
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";

  const relayUrl = (process.env.RELAY_WS_URL ?? "").trim();
  if (!relayUrl) {
    return NextResponse.json(
      { ok: false, error: "Local runs aren't enabled yet — the browser relay isn't configured.", code: "no_relay" },
      { status: 503 },
    );
  }

  // Step 1 — provision (no session yet): hand back a fresh relay session id + the
  // caller's per-user workspace JWT for the desktop to authenticate to the relay.
  if (typeof body.session !== "string" || !body.session) {
    const token = await getWorkspaceToken();
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "No workspace session — sign in and try again." },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true, step: "provision", session: randomUUID(), token, relayUrl });
  }

  // Step 2 — trigger the run, bound to this relay session + ephemeral. cloud/api
  // inserts the cloud_runs row with the local-relay routing already set, so
  // resolveBinding reads it at opencode session boot.
  if (!goal) return NextResponse.json({ ok: false, error: "A goal is required." }, { status: 400 });
  const session = body.session;

  let res: Response;
  try {
    res = await cloudFetch("/v1/runs", {
      method: "POST",
      body: JSON.stringify({
        goal: `Use the browser to: ${goal}`,
        browserTarget: "local_relay",
        relaySession: session,
        ephemeral: true,
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not start the run." },
      { status: 502 },
    );
  }

  const json = (await res.json().catch(() => null)) as
    | { runId?: string; error?: string }
    | null;
  if (!res.ok || !json?.runId) {
    return NextResponse.json(
      { ok: false, error: json?.error ?? "Could not start the run." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, step: "run", runId: json.runId, session });
}
