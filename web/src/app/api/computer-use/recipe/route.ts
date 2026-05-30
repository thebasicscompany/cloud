import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Computer-use self-learning. GET returns the best-matching prior approach for a
 * task (so the desktop loop can warm-start the model); POST saves the approach
 * that worked after a success. Tasks match by "shape" — significant tokens with
 * numbers/quotes stripped — so "compute 25*4" and "compute 17*9" share a recipe.
 */

const STOP = new Set([
  "the", "a", "an", "to", "in", "on", "of", "and", "then", "with", "for", "my", "me", "it",
  "this", "that", "use", "using", "please", "app", "desktop", "windows", "mac", "report",
  "tell", "show", "result", "do", "open",
]);

function tokenize(task: string): Set<string> {
  return new Set(
    task
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z\s]/g, " ") // also drops digits → numbers don't split recipes
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

function signature(task: string): string {
  return [...tokenize(task)].sort().join(" ");
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

const MATCH_THRESHOLD = 0.6;

export async function GET(req: Request) {
  const task = new URL(req.url).searchParams.get("task") ?? "";
  const ws = new URL(req.url).searchParams.get("ws") ?? PRIMARY_WORKSPACE_ID;
  if (!task.trim()) return NextResponse.json({ recipe: null });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ recipe: null });

  const taskTokens = tokenize(task);
  const { data } = await supabase
    .from("computer_use_recipes")
    .select("id,signature,approach,success_count")
    .eq("workspace_id", ws)
    .order("last_used_at", { ascending: false })
    .limit(50);

  let best: { approach: string; successCount: number; sim: number } | null = null;
  for (const r of (data ?? []) as Array<{ signature: string; approach: string; success_count: number }>) {
    const sim = jaccard(taskTokens, new Set(r.signature.split(" ").filter(Boolean)));
    if (sim >= MATCH_THRESHOLD && (!best || sim > best.sim)) {
      best = { approach: r.approach, successCount: r.success_count, sim };
    }
  }
  return NextResponse.json({ recipe: best ? { approach: best.approach, successCount: best.successCount } : null });
}

export async function POST(req: Request) {
  let body: { task?: unknown; approach?: unknown; title?: unknown; app?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate */
  }
  const task = typeof body.task === "string" ? body.task.trim() : "";
  const approach = typeof body.approach === "string" ? body.approach.trim() : "";
  const ws = typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : PRIMARY_WORKSPACE_ID;
  if (!task || !approach) return NextResponse.json({ ok: false, error: "task + approach required" }, { status: 400 });

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });

  const sig = signature(task);
  if (!sig) return NextResponse.json({ ok: false, error: "no signature" }, { status: 400 });

  // Upsert: on a repeat shape, bump success_count + refresh the approach.
  const { data: existing } = await supabase
    .from("computer_use_recipes")
    .select("id,success_count")
    .eq("workspace_id", ws)
    .eq("signature", sig)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("computer_use_recipes")
      .update({
        approach: approach.slice(0, 2000),
        success_count: (existing.success_count ?? 1) + 1,
        last_used_at: new Date().toISOString(),
        ...(typeof body.title === "string" ? { title: body.title.slice(0, 160) } : {}),
        ...(typeof body.app === "string" ? { app_hint: body.app.slice(0, 120) } : {}),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("computer_use_recipes").insert({
      workspace_id: ws,
      signature: sig,
      title: typeof body.title === "string" ? body.title.slice(0, 160) : "",
      approach: approach.slice(0, 2000),
      app_hint: typeof body.app === "string" ? body.app.slice(0, 120) : null,
    });
  }
  return NextResponse.json({ ok: true });
}
