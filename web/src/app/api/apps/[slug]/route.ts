import { NextResponse } from "next/server";

import { getApp } from "@/lib/apps-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** App detail incl. records — used when the user opens an app. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
  const app = await getApp(slug, workspaceId);
  if (!app) return NextResponse.json({ error: "App not found." }, { status: 404 });
  return NextResponse.json({ app });
}
