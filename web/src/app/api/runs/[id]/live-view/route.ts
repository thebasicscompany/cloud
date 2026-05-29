import { NextResponse } from "next/server";

import { getActiveLiveViewUrl } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The live-view URL for the run's currently-active browser tab (not the pinned about:blank one). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const liveViewUrl = await getActiveLiveViewUrl(id);
  return NextResponse.json({ liveViewUrl });
}
