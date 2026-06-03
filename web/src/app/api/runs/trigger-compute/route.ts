import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trigger a PURE computer-use run - the agent runs in the cloud and decides,
 * but execution is local computer-use (mouse/keyboard, any app) via the desktop
 * watcher. Unlike "my computer - your Chrome", this bridges NO browser: the run
 * is marked `browser_target='local_compute'`, which makes the worker offer
 * `computer_use` (rt.isLocal) WITHOUT launching any local Chrome. If the agent
 * ever needs a webpage it uses the cloud browser. No relay session needed - the
 * desktop watcher (always-on while the app is open) picks up the sub-task.
 *
 * Dispatch goes through cloud/api `POST /v1/runs` authed with the caller's
 * per-user workspace JWT (no service-role admin client, no local Lambda invoke).
 * cloud/api inserts the cloud_runs row with browser_target='local_compute' +
 * ephemeral, so the routing lands atomically at dispatch time.
 */
export async function POST(req: Request) {
  let body: { goal?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate empty */
  }
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (!goal) return NextResponse.json({ ok: false, error: "A goal is required." }, { status: 400 });

  let res: Response;
  try {
    res = await cloudFetch("/v1/runs", {
      method: "POST",
      body: JSON.stringify({ goal, browserTarget: "local_compute", ephemeral: true }),
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

  return NextResponse.json({ ok: true, runId: json.runId });
}
