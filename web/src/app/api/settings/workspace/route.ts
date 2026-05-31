import { NextResponse } from "next/server";

import { getWorkspaceSettings } from "@/lib/settings-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Workspace is derived from the caller's per-user JWT in cloud/api.
  const data = await getWorkspaceSettings();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}
