import { NextResponse } from "next/server";

import { cloudFetch } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint a short-lived Deepgram scoped token for the browser - by asking
 * cloud/api, NOT by holding `DEEPGRAM_API_KEY` here.
 *
 * Previously this route built a DeepgramClient from `process.env.DEEPGRAM_API_KEY`
 * directly, which forced the long-lived key to ship in the (bundled) web server's
 * env. cloud/api already owns this: `POST /v1/voice/credentials` →
 * `grantDeepgramToken()` returns `{ deepgramToken, sttUrl, ttsUrl, expiresIn }`.
 * We proxy to it with the caller's workspace JWT (added by `cloudFetch`) and map
 * the response to the `{ ok, token, expiresIn }` shape the voice clients
 * (`voice-button.tsx`, `pill/page.tsx`) already expect - so the key never leaves
 * cloud/api and the desktop bundle needs no `DEEPGRAM_API_KEY`.
 */
async function grant() {
  try {
    const res = await cloudFetch("/v1/voice/credentials", {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      // 503 = capability not provisioned upstream (no key); anything else → 502.
      return NextResponse.json({ ok: false }, { status: res.status === 503 ? 503 : 502 });
    }
    const data = (await res.json()) as { deepgramToken?: string; expiresIn?: number };
    if (!data.deepgramToken) {
      return NextResponse.json({ ok: false }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      token: data.deepgramToken,
      expiresIn: data.expiresIn ?? 3600,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

export async function POST() {
  return grant();
}

export async function GET() {
  return grant();
}
