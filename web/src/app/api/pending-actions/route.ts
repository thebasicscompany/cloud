import { NextResponse } from "next/server";

import { getWorkspacePendingActions } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Workspace-wide "waiting on you" — runs blocked needing a login/connection. */
export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const actions = await getWorkspacePendingActions(ws);
  return NextResponse.json({ actions });
}
