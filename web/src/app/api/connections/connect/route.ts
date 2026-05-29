import { NextResponse } from "next/server";

import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Initiate (or re-initiate) a Composio connection for a toolkit so the user can
 * connect / reconnect it from the app (e.g. the expired Gmail toolkit).
 *
 * This mirrors the proven Composio REST shape used elsewhere in the monorepo
 * (`@basics/shared` ComposioClient): base URL `…/api/v3.1`, `x-api-key` auth,
 * the toolkit's `auth_config` resolved via `GET /auth_configs`, and the OAuth
 * redirect produced by `POST /connected_accounts/link`.
 *
 * The Composio "user_id" convention in this codebase is `account_id ||
 * workspace_id`, and the WORKER resolves connections under `ctx.accountId`.
 * So we MUST file the connection under the workspace's account_id (resolved
 * the same way `trigger-run` attributes runs) — not the workspace_id — or the
 * agent's worker will never see the connected account. Falls back to the
 * workspace_id only when no account can be resolved.
 *
 * Never logs the API key or echoes it in responses.
 */

/** Resolve the Composio user_id the worker will use for this workspace's runs. */
async function resolveComposioUserId(workspaceId: string): Promise<string> {
  const supabase = getAdminClient();
  if (!supabase) return workspaceId;
  const agent = await supabase
    .from("cloud_agents")
    .select("account_id")
    .eq("workspace_id", workspaceId)
    .eq("agent_id", "ad-hoc")
    .maybeSingle();
  let accountId = (agent.data?.account_id as string | undefined) ?? undefined;
  if (!accountId) {
    const owner = await supabase
      .from("workspace_members")
      .select("account_id")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();
    accountId = (owner.data?.account_id as string | undefined) ?? undefined;
  }
  return accountId ?? workspaceId;
}

const COMPOSIO_BASE_URL = (process.env.COMPOSIO_BASE_URL ?? "https://backend.composio.dev/api/v3.1").replace(
  /\/+$/,
  "",
);

function getApiKey(): string | undefined {
  const key = process.env.COMPOSIO_API_KEY ?? process.env.BASICS_COMPOSIO_API_KEY;
  const trimmed = typeof key === "string" ? key.trim() : "";
  return trimmed || undefined;
}

interface AuthConfig {
  id: string;
  status?: string;
  toolkit?: { slug?: string };
}

interface ConnectLink {
  redirect_url?: string;
  connected_account_id?: string;
  [key: string]: unknown;
}

function normalizeItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)) {
    return (payload as { items: T[] }).items;
  }
  return [];
}

async function composio(
  apiKey: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; detail: string }> {
  const res = await fetch(`${COMPOSIO_BASE_URL}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, status: res.status, detail: detail.slice(0, 400) };
  }
  if (res.status === 204) return { ok: true, data: {} };
  return { ok: true, data: await res.json().catch(() => ({})) };
}

export async function POST(req: Request) {
  let body: { toolkit?: unknown; workspaceId?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // tolerate empty / malformed body
  }

  const toolkit = typeof body.toolkit === "string" ? body.toolkit.trim().toLowerCase() : "";
  const workspaceId =
    typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : PRIMARY_WORKSPACE_ID;

  if (!toolkit) {
    return NextResponse.json({ ok: false, error: "Missing 'toolkit' in request body." }, { status: 400 });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Composio is not configured.",
        hint: "Set COMPOSIO_API_KEY in web/.env.local (server-only).",
      },
      { status: 503 },
    );
  }

  // 1) Find the toolkit's auth_config (required to mint a connect link).
  const acRes = await composio(apiKey, "/auth_configs?limit=1000&show_disabled=true");
  if (!acRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Composio /auth_configs failed (HTTP ${acRes.status}).`,
        hint:
          acRes.status === 401
            ? "The configured COMPOSIO_API_KEY was rejected by Composio (invalid or expired). Rotate it in Doppler (backend/dev) and re-append it to web/.env.local."
            : "Verify COMPOSIO_BASE_URL and that the key has access to this Composio project.",
        detail: acRes.detail,
      },
      { status: 502 },
    );
  }

  const authConfigs = normalizeItems<AuthConfig>(acRes.data);
  const match = authConfigs.find(
    (a) => (a.toolkit?.slug ?? "").toLowerCase() === toolkit && a.status?.toUpperCase() !== "DISABLED",
  );
  if (!match) {
    return NextResponse.json(
      {
        ok: false,
        error: `No enabled Composio auth config found for toolkit "${toolkit}".`,
        hint: "Create/enable an auth config for this toolkit in the Composio dashboard first.",
      },
      { status: 404 },
    );
  }

  // 2) Mint the OAuth connect link under the worker's Composio user_id
  // (account_id) so the resulting connection is visible to agent runs.
  const composioUserId = await resolveComposioUserId(workspaceId);
  const linkRes = await composio(apiKey, "/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({ auth_config_id: match.id, user_id: composioUserId }),
  });
  if (!linkRes.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Composio /connected_accounts/link failed (HTTP ${linkRes.status}).`,
        hint: "The auth config exists but the connect link could not be created. Check the Composio auth config and redirect/callback configuration.",
        detail: linkRes.detail,
      },
      { status: 502 },
    );
  }

  const link = linkRes.data as ConnectLink;
  const redirectUrl = link.redirect_url;
  if (!redirectUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Composio returned no redirect_url for the connection.",
        hint: "The toolkit may use a non-OAuth auth scheme that cannot be completed via a redirect.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    toolkit,
    redirectUrl,
    connectedAccountId: link.connected_account_id ?? null,
  });
}
