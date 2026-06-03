import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const res = await cloudFetch("/v1/agents/draft-from-demo", { method: "POST", body });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { "content-type": "application/json" } });
}
