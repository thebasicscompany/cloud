"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * In the Electron app, exchange the signed-in user's Supabase session for a
 * short-lived workspace JWT (cloud/api `POST /v1/auth/token`) and push it to the
 * desktop main process, which hands it to the computer-use + Lens loops.
 *
 * This REPLACES the dev `/api/lens/context` route, which minted the JWT
 * server-side with WORKSPACE_JWT_SECRET. Now the secret stays solely in
 * cloud/api: the renderer only ever holds the user's own short-lived workspace
 * token, so the desktop bundle ships no signing secret and no service-role key.
 *
 * No-op in a plain browser (no `window.basichome`).
 */
type DesktopBridge = {
  isDesktop?: boolean;
  apiBase?: string;
  setWorkspaceToken?: (p: { token: string; userRole?: string }) => void;
  clearWorkspaceToken?: () => void;
  exchangeSupabaseSession?: (p: {
    access_token: string;
    workspace_id?: string;
  }) => Promise<{ ok: boolean; token?: string; expires_at?: string; error?: string }>;
};

export function DesktopAuthBridge() {
  useEffect(() => {
    const bh = (window as unknown as { basichome?: DesktopBridge }).basichome;
    if (!bh?.isDesktop || typeof bh.setWorkspaceToken !== "function") return;
    const apiBase = (bh.apiBase ?? "").replace(/\/+$/, "");
    if (!apiBase) return;

    const supabase = createClient();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function pushToken() {
      try {
        let token: string | undefined;
        let expiresAt: string | undefined;

        // Need a Supabase session either way (it's what cloud/api validates).
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) {
          bh?.clearWorkspaceToken?.();
          return;
        }

        // Preferred: have the MAIN process exchange the supabase token for a
        // workspace JWT. No CORS, no Supabase-cookie-sync race that makes
        // /api/auth/desktop-token flap with 401s in dev.
        if (typeof bh.exchangeSupabaseSession === "function") {
          const r = await bh.exchangeSupabaseSession({ access_token: accessToken });
          if (cancelled) return;
          if (r?.ok && r.token) {
            token = r.token;
            expiresAt = r.expires_at;
          }
        }

        // Fallbacks for safety: same-origin Next route, then direct from
        // renderer (works in packaged builds where the origin is CORS-allowed).
        if (!token) {
          try {
            const same = await fetch("/api/auth/desktop-token", { method: "POST" });
            if (same.ok) {
              const j = (await same.json()) as { token?: string; expires_at?: string };
              token = j.token;
              expiresAt = j.expires_at;
            }
          } catch {
            /* fall through */
          }
        }
        if (!token) {
          const res = await fetch(`${apiBase}/v1/auth/token`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ supabase_access_token: accessToken }),
          });
          if (!res.ok || cancelled) return;
          const j = (await res.json()) as { token?: string; expires_at?: string };
          token = j.token;
          expiresAt = j.expires_at;
        }

        if (!token || cancelled) {
          // Transient failure (cloud/api unreachable during a deploy, network
          // blip, etc.). Without this retry the bridge would give up forever
          // until the next auth-state change — and Supabase's silent refresh
          // doesn't fire one, so a single hiccup leaves the desktop loops
          // without a workspace token until you sign out + back in.
          if (!cancelled) timer = setTimeout(() => void pushToken(), 30_000);
          return;
        }
        bh?.setWorkspaceToken?.({ token });
        // Re-mint ~5 min before the 24h token expires.
        const lead = expiresAt
          ? new Date(expiresAt).getTime() - Date.now() - 5 * 60_000
          : 23 * 3600_000;
        timer = setTimeout(() => void pushToken(), Math.max(60_000, Math.min(lead, 23 * 3600_000)));
      } catch {
        // Same as the soft-failure path: keep retrying so a transient cloud/api
        // issue can't leave the desktop main process tokenless indefinitely.
        if (!cancelled) timer = setTimeout(() => void pushToken(), 30_000);
      }
    }

    void pushToken();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void pushToken());
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
