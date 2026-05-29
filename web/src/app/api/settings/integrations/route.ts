import { NextResponse } from "next/server";

import { getIntegrationsSettings } from "@/lib/settings-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  const integrations = await getIntegrationsSettings(ws);
  return NextResponse.json({ integrations });
}
