import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bundle a recorded routine - the spoken narration plus the screenshots the user
 * showed - into a durable Document and a prompt that drives the agent to build
 * (and run) an automation from the demonstration.
 *
 * Bundle-safe: this proxies the deployed runtime API
 *   POST /v1/documents/recorded-routine { narration, screenshots }
 * authed with the signed-in user's short-lived WORKSPACE JWT (cloud.ts). The
 * runtime uploads the screenshots to the public bucket + writes the
 * workspace_documents row under the verified workspace, so no service-role
 * client is needed in the renderer. The external contract
 * (`{ ok, slug, prompt, screenshots }`) is unchanged.
 */
export async function POST(req: Request) {
  let body: { narration?: unknown; screenshots?: unknown; minutes?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* tolerate */
  }

  let res: Response;
  try {
    res = await cloudFetch("/v1/documents/recorded-routine", {
      method: "POST",
      body: JSON.stringify({
        narration: body.narration,
        screenshots: body.screenshots,
        minutes: body.minutes,
      }),
    });
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { error: err.status === 401 ? "Sign in to record a routine." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ error: "Could not reach the runtime API." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    slug?: string;
    prompt?: string;
    screenshots?: number;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return NextResponse.json(
      { error: data.error ?? `Runtime API record failed (HTTP ${res.status}).` },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    slug: data.slug,
    prompt: data.prompt,
    screenshots: data.screenshots ?? 0,
  });
}
