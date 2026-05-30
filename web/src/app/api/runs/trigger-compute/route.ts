import { NextResponse } from "next/server";

import { getAdminClient } from "@/lib/supabase/admin";
import { triggerCloudRun } from "@/lib/trigger-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trigger a PURE computer-use run — the agent runs in the cloud and decides,
 * but execution is local computer-use (mouse/keyboard, any app) via the desktop
 * watcher. Unlike "my computer — your Chrome", this bridges NO browser: the run
 * is marked `browser_target='local_compute'`, which makes the worker offer
 * `computer_use` (rt.isLocal) WITHOUT launching any local Chrome. If the agent
 * ever needs a webpage it uses the cloud browser. No relay session needed — the
 * desktop watcher (always-on while the app is open) picks up the sub-task.
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

  const triggered = await triggerCloudRun({ goal });
  if (!triggered.ok || !triggered.runId) {
    return NextResponse.json({ ok: false, error: triggered.error ?? "Could not start the run." }, { status: 502 });
  }

  const supabase = getAdminClient();
  if (supabase) {
    await supabase
      .from("cloud_runs")
      .update({ browser_target: "local_compute", ephemeral: true })
      .eq("id", triggered.runId);
  }

  return NextResponse.json({ ok: true, runId: triggered.runId });
}
