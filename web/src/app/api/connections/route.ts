import { NextResponse } from "next/server";

import { getConnections } from "@/lib/connections-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const data = await getConnections(ws);
  return NextResponse.json(data);
}
