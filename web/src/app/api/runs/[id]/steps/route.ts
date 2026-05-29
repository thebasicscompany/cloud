import { NextResponse } from "next/server";

import { getCloudRunSteps } from "@/lib/cloud-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const steps = await getCloudRunSteps(id);
  return NextResponse.json({ steps });
}
