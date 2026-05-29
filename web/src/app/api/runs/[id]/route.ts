import { NextResponse } from "next/server";

import { getCloudRunById } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getCloudRunById(id);
  return NextResponse.json({ run });
}
