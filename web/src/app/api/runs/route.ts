import { NextResponse } from "next/server";

import { getCloudRuns } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const runs = await getCloudRuns(ws);
  return NextResponse.json({ runs });
}
