import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { WORKSPACE_COOKIE, cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";

/**
 * POST /api/workspace/create { name } → create a team workspace and switch into
 * it. Proxies cloud/api POST /v1/team/create-workspace, then sets the selection
 * cookie so the next render is scoped to the new workspace.
 */
export async function POST(req: Request) {
  let name: unknown;
  try {
    ({ name } = (await req.json()) as { name?: unknown });
  } catch {
    name = undefined;
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ ok: false, error: "Workspace name is required." }, { status: 400 });
  }
  try {
    const res = await cloudFetch("/v1/team/create-workspace", {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      workspace?: { id?: string };
      error?: string;
    };
    if (res.ok && data.ok && data.workspace?.id) {
      (await cookies()).set(WORKSPACE_COOKIE, data.workspace.id, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return NextResponse.json(data);
    }
    return NextResponse.json(data, { status: res.ok ? 400 : res.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not create workspace." }, { status: 502 });
  }
}
