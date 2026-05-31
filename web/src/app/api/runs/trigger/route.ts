import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trigger a cloud run. Bundle-safe: dispatches through cloud/api
 * (`POST /v1/runs`) with the caller's per-user workspace JWT instead of the
 * service-role admin client + cron-kicker Lambda. The workspace is derived from
 * the JWT server-side, so the client-supplied `workspaceId` is ignored.
 *
 * External contract is unchanged: `{ ok, runId?, error? }`.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { goal?: string } | null;
  const goal = body?.goal?.trim();
  if (!goal) {
    return NextResponse.json({ ok: false, error: "goal is required." }, { status: 400 });
  }

  try {
    const res = await cloudFetch("/v1/runs", {
      method: "POST",
      body: JSON.stringify({ goal }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { ok: false, error: err?.error ?? "Failed to start run." },
        { status: 400 },
      );
    }
    const json = (await res.json()) as { runId?: string };
    return NextResponse.json({ ok: true, runId: json.runId }, { status: 200 });
  } catch (e) {
    const status = e instanceof CloudApiError ? e.status : 500;
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to start run." },
      { status: status === 401 ? 401 : 400 },
    );
  }
}
