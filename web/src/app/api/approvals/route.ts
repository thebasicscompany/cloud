import { NextResponse } from "next/server";

import { getApprovals } from "@/lib/approvals-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Real pending/resolved approvals from the live `pending_approvals` table. */
export async function GET() {
  const approvals = await getApprovals();
  return NextResponse.json({ approvals, trustGrants: [] });
}
