import { NextResponse } from "next/server";

import { getTrustSettings } from "@/lib/settings-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Workspace is derived from the caller's per-user JWT in cloud/api.
  const grants = await getTrustSettings();
  return NextResponse.json({ grants });
}
