import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Run an automation now. Bundle-safe: dispatches through cloud/api
 * (`POST /v1/automations/:id/run`) with the caller's per-user workspace JWT.
 * That endpoint resolves the automation's goal server-side, inserts the
 * cloud_runs row (automation_id + version + triggered_by='manual'), and
 * publishes to the runs queue - no admin client / cron-kicker, no
 * client-supplied workspace. External contract is unchanged: `{ ok, runId? }`.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    const res = await cloudFetch(`/v1/automations/${id}/run`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (res.status === 404) {
      return NextResponse.json({ ok: false, error: "automation not found" }, { status: 404 });
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { ok: false, error: err?.error ?? "Failed to run automation." },
        { status: 400 },
      );
    }
    const json = (await res.json()) as { runId?: string };
    return NextResponse.json({ ok: true, runId: json.runId }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to run automation." },
      { status: 500 },
    );
  }
}
