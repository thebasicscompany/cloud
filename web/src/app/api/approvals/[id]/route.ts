import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Decide a pending approval. Bundle-safe: forwards the decision to cloud/api
 * (`POST /v1/pending-approvals/:id`) with the caller's per-user workspace JWT
 * (no admin client / hardcoded workspace). cloud/api writes `decision` +
 * `decision_payload` + `resolved_at`/`decided_at` on the `pending_approvals`
 * row; the worker's approval gate polls it and resumes (approve) or aborts
 * (anything else) the paused tool call within ~2s.
 *
 * The `action` → `decision` mapping stays here so the external contract
 * (callers POST `{ action }`) is identical; the workspace is derived from the
 * JWT server-side, so `workspaceId` is ignored.
 */
const ACTION_TO_DECISION: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
  revoke: "rejected",
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { action?: unknown; reason?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body ok */
  }

  const action = typeof body.action === "string" ? body.action : "";
  const decision = ACTION_TO_DECISION[action];
  if (!decision) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason : null;

  try {
    const res = await cloudFetch(`/v1/pending-approvals/${id}`, {
      method: "POST",
      body: JSON.stringify({ decision, reason }),
    });
    if (res.status === 404) {
      return NextResponse.json({ error: "not found or already resolved" }, { status: 404 });
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json({ error: err?.error ?? "decision failed" }, { status: res.status });
    }
    return NextResponse.json({ ok: true, id, decision });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "decision failed" },
      { status: 500 },
    );
  }
}
