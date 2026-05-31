import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";

/**
 * POST /api/billing/checkout { plan } → Stripe Checkout Session url.
 * Proxies cloud/api POST /v1/billing/checkout with the workspace JWT (admin+).
 */
export async function POST(req: Request) {
  let plan: unknown;
  try {
    ({ plan } = (await req.json()) as { plan?: unknown });
  } catch {
    plan = undefined;
  }
  if (plan !== "pro" && plan !== "team") {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }
  try {
    const res = await cloudFetch("/v1/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
