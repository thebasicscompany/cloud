import { NextResponse } from "next/server";

import { cloudGet } from "@/lib/api/cloud";

export const runtime = "nodejs";

type Invite = { id: string; token: string; role: string; workspaceId: string; workspaceName: string };

/**
 * GET /api/team/invites-for-me
 *
 * Pending invitations addressed to the signed-in user's verified email, across
 * whichever workspaces invited them. Proxies cloud/api
 * `GET /v1/team/invites-for-me` with the request's workspace JWT. Powers the
 * in-app "you've been invited" banner so invitees accept without hunting for the
 * email link. Degrades to an empty list on any failure (signed-out, API down).
 */
export async function GET() {
  const data = await cloudGet<{ invites: Invite[] }>("/v1/team/invites-for-me", { invites: [] });
  return NextResponse.json(data);
}
