import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "routine-captures";
const MAX_SHOTS = 8;

/**
 * Bundle a recorded routine — the spoken narration plus the screenshots the user
 * showed — into a durable Document and a prompt that drives the agent to build
 * (and run) an automation from the demonstration. Screenshots are uploaded to a
 * public bucket so both the user (in Documents) and the cloud agent (which can
 * open the URLs in its browser) can see exactly what was demonstrated.
 */
export async function POST(req: Request) {
  let body: { narration?: unknown; screenshots?: unknown; minutes?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate */
  }
  const narration = typeof body.narration === "string" ? body.narration.trim() : "";
  const shots = Array.isArray(body.screenshots)
    ? (body.screenshots.filter((s) => typeof s === "string") as string[]).slice(0, MAX_SHOTS)
    : [];

  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "Backend not connected." }, { status: 503 });

  const ws = PRIMARY_WORKSPACE_ID;
  const id = randomUUID().slice(0, 8);

  // Upload the screenshots → public URLs.
  const urls: string[] = [];
  for (let i = 0; i < shots.length; i++) {
    const m = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(shots[i]!);
    if (!m) continue;
    const ext = m[1] === "png" ? "png" : "jpg";
    const buf = Buffer.from(m[2]!, "base64");
    const path = `${ws}/${id}/step-${String(i + 1).padStart(2, "0")}.${ext}`;
    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: `image/${ext === "jpg" ? "jpeg" : "png"}`, upsert: true });
    if (!up.error) {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
  }

  // Durable Document: narration + the demonstrated screenshots.
  const shotsMd = urls.length
    ? urls.map((u, i) => `### Step ${i + 1}\n\n![Step ${i + 1}](${u})`).join("\n\n")
    : "_(no screenshots captured)_";
  const docBody = `# Recorded routine\n\nA workflow demonstrated with narration + screenshots, to turn into an automation.\n\n## What I said while doing it\n\n${narration || "_(no narration captured)_"}\n\n## What I showed\n\n${shotsMd}\n`;
  const slug = `recorded-routine-${id}`;
  await supabase
    .from("workspace_documents")
    .insert({
      workspace_id: ws,
      slug,
      title: "Recorded routine",
      summary: (narration || "A recorded routine to turn into an automation.").slice(0, 160),
      icon: "document",
      body: docBody,
      status: "ready",
    })
    .select("slug")
    .maybeSingle();

  // The prompt: narration + the screenshot URLs the agent can open to SEE the
  // demonstration, then build + run the automation.
  const shotList = urls.length
    ? `\n\nI also took ${urls.length} screenshots of exactly what I did — open each to see the steps:\n${urls.map((u, i) => `${i + 1}. ${u}`).join("\n")}`
    : "";
  const prompt = `Build a reusable automation from a routine I just recorded, then run it.

What I said while demonstrating it:
${narration || "(no narration captured)"}${shotList}

Use the narration and the screenshots (open the URLs in your browser to view them) to reproduce this exact workflow as an automation. Save it, then run it once to confirm it works.`;

  return NextResponse.json({ ok: true, slug, prompt, screenshots: urls.length });
}
