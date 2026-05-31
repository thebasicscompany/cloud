import "server-only";

import { cache } from "react";

import { cookies } from "next/headers";

import { decodeJwt } from "jose";

import { createClient } from "@/lib/supabase/server";

/**
 * Server-side client for the deployed runtime API (`cloud/api`, `/v1/*`).
 *
 * This is the secure replacement for the dev-grade data libs that used the
 * Supabase service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID. Here we
 * derive a short-lived WORKSPACE JWT from the signed-in user's Supabase session
 * (cloud/api `POST /v1/auth/token`) and call `/v1/*` with it — so every read is
 * scoped to the caller's workspace by the backend, and NO service-role key or
 * JWT-signing secret is ever needed in the renderer (critical once the renderer
 * is bundled into Electron with no hosted web).
 */

const API_BASE = (process.env.API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/**
 * Cookie holding the user's currently-selected workspace_id, written by the
 * in-app workspace switcher (`/api/workspace/switch`). Read here to scope the
 * minted JWT to that workspace.
 */
export const WORKSPACE_COOKIE = "basics-workspace";

export class CloudApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "CloudApiError";
  }
}

/**
 * The workspace JWT for the current request, exchanged from the user's Supabase
 * session. Memoized per request (React `cache`) so a page hitting several
 * cloud/api endpoints exchanges the session only once. Returns "" when there is
 * no session or no API base (callers degrade to an empty / signed-out state).
 */
export const getWorkspaceToken = cache(async (): Promise<string> => {
  if (!API_BASE) return "";
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return "";

  // The user's selected workspace (the in-app switcher writes this cookie). Try
  // it first, then fall back to the default (personal) workspace if it fails —
  // so a stale cookie (e.g. a workspace the user has since left) can never lock
  // them out of the app.
  const cookieStore = await cookies();
  const selected = cookieStore.get(WORKSPACE_COOKIE)?.value;

  const mint = async (workspaceId?: string): Promise<string> => {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          workspaceId
            ? { supabase_access_token: accessToken, workspace_id: workspaceId }
            : { supabase_access_token: accessToken },
        ),
        cache: "no-store",
      });
      if (!res.ok) return "";
      const json = (await res.json()) as { token?: string };
      return json.token ?? "";
    } catch {
      return "";
    }
  };

  if (selected) {
    const scoped = await mint(selected);
    if (scoped) return scoped;
  }
  return mint();
});

/** True once the runtime API base is configured and the user has a session. */
export async function hasWorkspaceSession(): Promise<boolean> {
  return Boolean(await getWorkspaceToken());
}

/**
 * The `workspace_id` claim from the current request's workspace JWT, or "" when
 * signed out. Used only to build `:workspaceId`-path runtime endpoints (e.g.
 * `/v1/workspaces/:ws/browser-sites/...`); the backend STILL re-verifies the
 * token and cross-checks the path against the verified claim, so decoding here
 * (no signature check) is safe — a tampered id can't address another workspace.
 */
export async function getWorkspaceId(): Promise<string> {
  const token = await getWorkspaceToken();
  if (!token) return "";
  try {
    const claims = decodeJwt(token) as { workspace_id?: unknown };
    return typeof claims.workspace_id === "string" ? claims.workspace_id : "";
  } catch {
    return "";
  }
}

/**
 * Fetch `cloud/api` (`/v1/...`) authed with the request's workspace JWT. Use
 * from server components + route handlers in place of the old admin client.
 */
export async function cloudFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!API_BASE) throw new CloudApiError(503, "API_BASE_URL not configured");
  const token = await getWorkspaceToken();
  if (!token) throw new CloudApiError(401, "no workspace session");
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-workspace-token": token,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    cache: "no-store",
  });
}

/** GET `cloud/api` and parse JSON, returning `fallback` on any failure. */
export async function cloudGet<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await cloudFetch(path);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * GET a PUBLIC `cloud/api` endpoint (no workspace JWT) and parse JSON, returning
 * `fallback` on any failure. For unauthenticated surfaces where the caller has
 * no session yet — e.g. the invite-accept page, where the opaque invite token in
 * the path/query is the credential, not a workspace JWT.
 */
export async function cloudGetPublic<T>(path: string, fallback: T): Promise<T> {
  if (!API_BASE) return fallback;
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
