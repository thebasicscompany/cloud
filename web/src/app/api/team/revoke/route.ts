import { NextResponse } from "next/server";

import { revokeInvitation } from "@/lib/invitations";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  }
  const res = await revokeInvitation(body.id);
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
