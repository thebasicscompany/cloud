import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { WORKSPACE_COOKIE, cloudFetch } from "@/lib/api/cloud";

/**
 * POST /api/workspace/leave
 *
 * Leaves the user's CURRENT workspace (the one the active JWT is scoped to).
 * cloud/api `POST /v1/team/leave` enforces the rules - you can't leave your
 * personal workspace, and a sole owner must transfer/delete first. On success we
 * clear the selection cookie so the next render falls back to the personal
 * workspace.
 */
export async function POST() {
  try {
    const res = await cloudFetch("/v1/team/leave", { method: "POST", body: JSON.stringify({}) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { ok: false, error: data.error ?? "Could not leave workspace." },
        { status: res.ok ? 400 : res.status },
      );
    }
    (await cookies()).delete(WORKSPACE_COOKIE);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not leave workspace." }, { status: 500 });
  }
}
