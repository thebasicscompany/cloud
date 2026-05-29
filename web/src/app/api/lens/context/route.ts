import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Identity the local Lens daemon needs to scope a capture session: the workspace
 * the agent reads from, and the owning account. The desktop pill fetches this
 * and passes it to `lensRecordStart` so `/v1/sessions` (which requires
 * workspace_id + user_id) succeeds and the capture lands in the right workspace.
 */
export async function GET(req: Request) {
  const ws = new URL(req.url).searchParams.get("ws") ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  let userId = "";
  if (supabase) {
    const { data } = await supabase
      .from("workspace_members")
      .select("account_id,role")
      .eq("workspace_id", ws);
    const rows = data ?? [];
    const owner = rows.find((m) => (m.role as string | null)?.toLowerCase() === "owner");
    userId = (owner?.account_id as string) ?? (rows[0]?.account_id as string) ?? "";
  }
  return NextResponse.json({ workspaceId: ws, userId });
}
