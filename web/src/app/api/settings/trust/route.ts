import { NextResponse } from "next/server";

import { getTrustSettings } from "@/lib/settings-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const grants = await getTrustSettings(ws);
  return NextResponse.json({ grants });
}
