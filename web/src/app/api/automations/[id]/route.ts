import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";
import { getCloudAutomationDetail } from "@/lib/automations-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const detail = await getCloudAutomationDetail(id, ws);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * Automation mutations — bundle-safe via cloud/api (`PATCH /v1/automations/:id`)
 * with the caller's per-user workspace JWT (no admin client / hardcoded
 * workspace). The cloud/api handler ports the same action logic:
 *  - pause/resume → status
 *  - updateSchedule → triggers jsonb (the schedule entry's cron/timezone)
 *  - grantTrust/revokeTrust → approval_policy.mode (autonomy)
 *  - setRunTarget → run_target
 * The workspace is derived from the JWT server-side; `workspaceId` is ignored.
 */
const VALID_ACTIONS = new Set([
  "pause",
  "resume",
  "grantTrust",
  "revokeTrust",
  "updateSchedule",
  "setRunTarget",
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { action?: string; cron?: string; timezone?: string; target?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty */
  }
  if (!body.action || !VALID_ACTIONS.has(body.action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  try {
    const res = await cloudFetch(`/v1/automations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        action: body.action,
        cron: body.cron,
        timezone: body.timezone,
        target: body.target,
      }),
    });
    if (res.status === 404) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      return NextResponse.json({ error: err?.error ?? "update failed" }, { status: res.status });
    }
    return NextResponse.json({ ok: true, id, action: body.action });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "update failed" },
      { status: 500 },
    );
  }
}
