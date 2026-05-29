import { NextResponse } from "next/server";

import { sendInviteEmail } from "@/lib/email-invite";
import { createInvitation } from "@/lib/invitations";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { workspaceId?: string; email?: string; role?: string; workspaceName?: string }
    | null;
  if (!body?.workspaceId || !body?.email) {
    return NextResponse.json({ ok: false, error: "workspaceId and email are required." }, { status: 400 });
  }

  const created = await createInvitation({
    workspaceId: body.workspaceId,
    email: body.email,
    role: body.role,
  });
  if (!created.ok || !created.invitation) {
    return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const acceptUrl = `${base}/invite/${created.invitation.token}`;
  const sent = await sendInviteEmail({
    to: created.invitation.email,
    workspaceName: body.workspaceName ?? "your basichome workspace",
    acceptUrl,
    role: created.invitation.role,
  });

  return NextResponse.json({
    ok: true,
    invitation: { ...created.invitation, token: undefined },
    acceptUrl,
    emailed: sent.ok,
    emailMessageId: sent.messageId,
    emailError: sent.error,
  });
}
