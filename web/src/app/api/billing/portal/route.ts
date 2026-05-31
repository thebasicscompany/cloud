import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";

/**
 * GET /api/billing/portal → Stripe Billing Portal url.
 * Proxies cloud/api GET /v1/billing/portal with the workspace JWT (admin+).
 */
export async function GET() {
  try {
    const res = await cloudFetch("/v1/billing/portal");
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
