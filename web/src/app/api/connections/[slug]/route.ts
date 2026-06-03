import { NextResponse } from "next/server";

import { cloudFetch, CloudApiError } from "@/lib/api/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Disconnect a workspace's Composio toolkit connection (e.g. Notion).
 *
 * Forwards to the runtime API:
 *   DELETE /v1/connections/:slug
 * which revokes the OAuth account on Composio + clears the local
 * composio_tool_cache row.
 */

const SLUG_RE = /^[a-z0-9_-]{1,80}$/;

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await params;
  const slug = (rawSlug ?? "").trim().toLowerCase();

  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid connection slug." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await cloudFetch(`/v1/connections/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
  } catch (err) {
    if (err instanceof CloudApiError) {
      return NextResponse.json(
        { error: err.status === 401 ? "Sign in to disconnect." : err.message },
        { status: err.status === 401 ? 401 : 503 },
      );
    }
    return NextResponse.json({ error: "Could not reach the runtime API." }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    composioRevoked?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error ?? `Disconnect failed (HTTP ${res.status}).` },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    slug,
    composioRevoked: data.composioRevoked ?? false,
  });
}
