import { NextResponse } from "next/server";

import { getRunConnectionNeeds } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Toolkits this run is blocked on because their Composio connection is
 * missing/expired (derived from `connection_expired` activity rows). The run
 * detail banner uses this to prompt the user to connect them.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const toolkits = await getRunConnectionNeeds(id);
  return NextResponse.json({ toolkits });
}
