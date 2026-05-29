import { NextResponse } from "next/server";

import { getRunBrowserLoginNeeds, getRunConnectionNeeds } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this run is blocked on and needs the user to connect:
 *  - `toolkits`: missing/expired Composio connections (`connection_expired`).
 *  - `browserSites`: hosts needing a browser login (`browser_login_required`).
 * The run detail banner uses both to offer one-click connect / sign-in.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [toolkits, browserSites] = await Promise.all([
    getRunConnectionNeeds(id),
    getRunBrowserLoginNeeds(id),
  ]);
  return NextResponse.json({ toolkits, browserSites });
}
