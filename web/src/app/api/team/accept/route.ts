import { NextResponse } from "next/server";

import { acceptInvitation } from "@/lib/invitations";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) {
    return NextResponse.json({ ok: false, error: "token is required." }, { status: 400 });
  }
  const res = await acceptInvitation(body.token);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
