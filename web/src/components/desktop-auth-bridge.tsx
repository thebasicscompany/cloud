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

        // Prefer a SAME-ORIGIN mint. The dev renderer (http://localhost:3000)
        // can't call the cross-origin cloud/api `/v1/auth/token` directly — CORS
        // blocks it — so a Next route mints the workspace JWT server-side from
        // the session cookie. In a packaged build (null origin) this 404s and we
        // fall back to the direct exchange below.
        try {
          const same = await fetch("/api/auth/desktop-token", { method: "POST" });
          if (same.ok) {
            const j = (await same.json()) as { token?: string; expires_at?: string };
            token = j.token;
            expiresAt = j.expires_at;
          }
        } catch {
          /* fall through to the direct cloud/api exchange */
        }

        // Fallback: direct cloud/api exchange (origins the api CORS-allows, e.g.
        // the packaged app's `null` origin).
        if (!token) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const accessToken = session?.access_token;
          if (!accessToken) {
            bh?.clearWorkspaceToken?.();
            return;
          }
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

        if (!token || cancelled) return;
        bh?.setWorkspaceToken?.({ token });
        // Re-mint ~5 min before the 24h token expires.
        const lead = expiresAt
          ? new Date(expiresAt).getTime() - Date.now() - 5 * 60_000
          : 23 * 3600_000;
        timer = setTimeout(() => void pushToken(), Math.max(60_000, Math.min(lead, 23 * 3600_000)));
      } catch {
        /* retry on the next auth-state change */
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
