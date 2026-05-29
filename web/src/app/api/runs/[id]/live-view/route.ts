import { NextResponse } from "next/server";

import { getActiveLiveView } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The live-view URL + page URL for the run's currently-active tab (not the pinned about:blank one). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { liveViewUrl, pageUrl } = await getActiveLiveView(id);
  return NextResponse.json({ liveViewUrl, pageUrl });
}
