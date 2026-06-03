import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Message / steer a run - entirely through cloud/api (bundle-safe; no direct DB).
 *
 * If the run is LIVE, cloud/api's `POST /v1/runs/:id/message` pg_notifies the
 * pool channel ({kind:'continue'}) and the worker folds the message into the
 * running opencode session. If it isn't live (or that endpoint isn't reachable
 * yet - e.g. before an api deploy), we fall back to starting a NEW follow-up run
 * that references the original.
 *
 * Previously this used `lib/run-steer.ts`, which opened a direct session-mode
 * Postgres connection (DATABASE_URL_SESSION) from the web layer - now removed so
 * the desktop bundle holds no DB connection string.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { message?: string } | null;
  const message = body?.message?.trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required." }, { status: 400 });
  }

  // Try to steer the LIVE run via cloud/api.
  try {
    const res = await cloudFetch(`/v1/runs/${id}/message`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as { steered?: boolean } | null;
      if (j?.steered) {
        return NextResponse.json({ ok: true, mode: "steer" });
      }
      // steered:false → run isn't live; fall through to a follow-up run.
    } else if (res.status !== 404 && res.status !== 409) {
      // A hard upstream error (not "endpoint missing" / "not live").
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { ok: false, error: err?.error ?? "Failed to message the run." },
        { status: 502 },
      );
    }
  } catch {
    // Network error → fall through to the follow-up run.
  }

  // No live run to steer - start a NEW follow-up run that references the original.
  const goal = `Follow-up to a previous run. Previous run id: ${id}. New instruction: ${message}`;
  try {
    const res = await cloudFetch("/v1/runs", {
      method: "POST",
      body: JSON.stringify({ goal }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json(
        { ok: false, error: err?.error ?? "Failed to start follow-up run." },
        { status: 500 },
      );
    }
    const json = (await res.json()) as { runId?: string };
    return NextResponse.json({ ok: true, mode: "followup", runId: json.runId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to start follow-up run." },
      { status: 500 },
    );
  }
}
