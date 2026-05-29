import { NextResponse } from "next/server";

import { triggerCloudRun } from "@/lib/trigger-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { goal?: string; workspaceId?: string }
    | null;
  if (!body?.goal) {
    return NextResponse.json({ ok: false, error: "goal is required." }, { status: 400 });
  }
  const res = await triggerCloudRun({ goal: body.goal, workspaceId: body.workspaceId });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
