import { NextResponse } from "next/server";

import { getCloudAutomations } from "@/lib/automations-data";
import { getAutomationsList } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? undefined;
  // `agents` = thin projection for the home dashboard; `automations` = rich
  // shape for the Automations workbench. Both real (automations table).
  const [agents, automations] = await Promise.all([getAutomationsList(ws), getCloudAutomations(ws)]);
  return NextResponse.json({ agents, automations });
}
