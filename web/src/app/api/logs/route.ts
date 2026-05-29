import { NextResponse } from "next/server";

import { getCloudActivityEvents } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const events = await getCloudActivityEvents(ws);
  return NextResponse.json({ events });
}
