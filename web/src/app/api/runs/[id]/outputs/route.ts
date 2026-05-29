import { NextResponse } from "next/server";

import { getRunOutputs } from "@/lib/documents-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Documents this run produced (so the run detail can link to its output). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ documents: await getRunOutputs(id) });
}
