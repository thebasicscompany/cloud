import { NextResponse } from "next/server";

import { steerRun } from "@/lib/run-steer";
import { triggerCloudRun } from "@/lib/trigger-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Message / steer a run.
 *
 * If the run is LIVE (a worker is currently executing it), the message is
 * delivered as a follow-up turn to the running opencode session via a Postgres
 * NOTIFY on the pool channel ({kind:'continue', ...}). The run keeps going,
 * incorporating the new instruction.
 *
 * If the run is no longer live (already completed/failed, or no open binding),
 * we fall back to starting a NEW follow-up run that references the original.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required." }, { status: 400 });
  }

  const steer = await steerRun(id, message);
  if (steer.ok) {
    return NextResponse.json({ ok: true, mode: "steer" });
  }

  // Hard errors (misconfig / connection) are surfaced; only fall back when the
  // run simply isn't live anymore.
  if (steer.reason !== "not_live") {
    return NextResponse.json(
      { ok: false, error: steer.error ?? "Failed to message the run." },
      { status: 500 },
    );
  }

  const goal = `Follow-up to a previous run. Previous run id: ${id}. New instruction: ${message}`;
  const followup = await triggerCloudRun({ goal });
  if (!followup.ok) {
    return NextResponse.json(
      { ok: false, error: followup.error ?? "Failed to start follow-up run." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, mode: "followup", runId: followup.runId });
}
