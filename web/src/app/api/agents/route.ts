import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Previously this proxy silently returned `{agents: []}` on any non-2xx OR
  // any thrown error, which made an expired workspace JWT (401), a DB outage
  // (500), and "you genuinely have no agents" all look identical in the UI -
  // user saw a blank library and couldn't tell why. Now we pass the real
  // status + error through; the renderer can show "session expired, sign in
  // again" vs. "no agents yet" vs. a generic error toast.
  try {
    const res = await cloudFetch("/v1/agents");
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "agents_unavailable", message: e instanceof Error ? e.message : "unknown" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const res = await cloudFetch("/v1/agents", { method: "POST", body });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { "content-type": "application/json" } });
}
