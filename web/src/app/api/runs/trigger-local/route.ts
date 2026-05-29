import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";
import { triggerCloudRun } from "@/lib/trigger-run";
import { mintWorkspaceJwt } from "@/lib/workspace-jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Model B — "Run on my computer". Two-step so the desktop bridge is up before
 * the worker connects:
 *
 *  1) POST { goal } (no session)  → mint a per-run relay session id + workspace
 *     JWT and return { session, token, relayUrl }. The renderer then calls
 *     window.basichome.localRelayStart({relayUrl, session, token}) to bridge
 *     the user's local Chrome into the relay.
 *  2) POST { goal, session }      → trigger the cloud run and mark it
 *     browser_target='local_relay' + relay_session + ephemeral, so the worker
 *     attaches its CDP to the relay (the user's Chrome) instead of Browserbase.
 *
 * The relay endpoint is read from RELAY_WS_URL (server) — when unset, local
 * runs are not available and we say so.
 */
export async function POST(req: Request) {
  let body: { goal?: unknown; session?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty body
  }
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const workspaceId =
    typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : PRIMARY_WORKSPACE_ID;

  const relayUrl = (process.env.RELAY_WS_URL ?? "").trim();
  if (!relayUrl) {
    return NextResponse.json(
      { ok: false, error: "Local runs aren't enabled yet — the browser relay isn't configured.", code: "no_relay" },
      { status: 503 },
    );
  }

  // Step 1 — provision (no session yet): mint session + workspace JWT.
  if (typeof body.session !== "string" || !body.session) {
    let token: string;
    try {
      token = await mintWorkspaceJwt(workspaceId);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "Could not mint a workspace token.", hint: e instanceof Error ? e.message : undefined },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, step: "provision", session: randomUUID(), token, relayUrl });
  }

  // Step 2 — trigger the run, bound to this relay session + ephemeral.
  if (!goal) return NextResponse.json({ ok: false, error: "A goal is required." }, { status: 400 });
  const session = body.session;

  const triggered = await triggerCloudRun({ goal: `Use the browser to: ${goal}` });
  if (!triggered.ok || !triggered.runId) {
    return NextResponse.json({ ok: false, error: triggered.error ?? "Could not start the run." }, { status: 502 });
  }

  const supabase = getAdminClient();
  if (supabase) {
    // Set the local-relay routing on the run row. resolveBinding reads these at
    // opencode session boot (after dispatch + pool pickup), so this lands first.
    await supabase
      .from("cloud_runs")
      .update({ browser_target: "local_relay", relay_session: session, ephemeral: true })
      .eq("id", triggered.runId);
  }

  return NextResponse.json({ ok: true, step: "run", runId: triggered.runId, session });
}
