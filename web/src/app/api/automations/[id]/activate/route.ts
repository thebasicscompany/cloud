import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";

/**
 * POST /api/automations/:id/activate — flip a draft/paused automation to active.
 * Proxies cloud/api `POST /v1/automations/:id/activate`, which registers the
 * automation's triggers (EventBridge schedule + any Composio webhooks) BEFORE
 * flipping status. On a trigger-registration failure cloud/api returns 422 with
 * a structured `{ message, failures }`; we pass it straight through so the UI
 * can tell the user exactly what to fix.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const res = await cloudFetch(`/v1/automations/${id}/activate`, { method: "POST", body: "{}" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "activate failed" },
      { status: 500 },
    );
  }
}
