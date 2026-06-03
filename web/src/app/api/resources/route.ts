import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/resources         - list this workspace's resources
 * POST /api/resources        - add a new one (user-added)
 *
 * Thin proxies onto /v1/resources on the deployed API, authed with the
 * signed-in user's short-lived WORKSPACE JWT (cloud.ts).
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.search;
  const res = await cloudFetch(`/v1/resources${qs}`, { method: "GET" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request) {
  const body = await req.text();
  const res = await cloudFetch("/v1/resources", { method: "POST", body });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
