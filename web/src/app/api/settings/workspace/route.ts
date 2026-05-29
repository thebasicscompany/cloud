import { NextResponse } from "next/server";

import { getWorkspaceSettings } from "@/lib/settings-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const data = await getWorkspaceSettings(ws);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
