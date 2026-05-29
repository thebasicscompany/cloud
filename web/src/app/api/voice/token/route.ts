import { DeepgramClient } from "@deepgram/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 600;

/**
 * Mint a short-lived Deepgram scoped token for the browser.
 *
 * Mirrors the backend pattern in `api/src/lib/deepgram.ts`: build a
 * `DeepgramClient` from `DEEPGRAM_API_KEY` and call
 * `client.auth.v1.tokens.grant({ ttl_seconds })`. The browser uses the
 * returned token to open a realtime STT WebSocket directly against Deepgram,
 * so the long-lived API key never leaves the server.
 *
 * NOTE: `@deepgram/sdk@5` does not export `createClient`; it exports
 * `DeepgramClient` (a custom websocket-aware client) which takes `{ apiKey }`.
 * We never log the minted token (it would leak credentials).
 */
async function grant() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  try {
    const client = new DeepgramClient({ apiKey });
    const result = await client.auth.v1.tokens.grant({ ttl_seconds: TTL_SECONDS });
    if (typeof result.access_token !== "string" || result.access_token.length === 0) {
      return NextResponse.json({ ok: false }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      token: result.access_token,
      expiresIn: result.expires_in ?? TTL_SECONDS,
    });
  } catch (err) {
    // Never log the response body — would leak the token on a partial success.
    const message = err instanceof Error ? err.message : "deepgram grant failed";
    console.error("voice token grant failed:", message);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

export async function POST() {
  return grant();
}

export async function GET() {
  return grant();
}
