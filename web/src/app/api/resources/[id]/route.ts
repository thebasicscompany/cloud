import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/resources/:id  - edit name / URL / description / agentAccess
 * DELETE /api/resources/:id - drop from registry
 *
 * Thin proxies to /v1/resources/:id, authed by the renderer's WORKSPACE JWT.
 */

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.text();
  const res = await cloudFetch(`/v1/resources/${encodeURIComponent(id)}`, { method: "PATCH", body });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await cloudFetch(`/v1/resources/${encodeURIComponent(id)}`, { method: "DELETE" });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
