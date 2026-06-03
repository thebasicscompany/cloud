"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Desktop-only "Sign in via browser" (the Wispr/Linear web-bridge model).
 *
 * The Electron app opens the landing site's /desktop-login-bridge in the system
 * browser; after the user signs in there, that page POSTs the Supabase session to
 * the app's loopback (desktop/auth-bridge.js), which forwards it here over IPC.
 * We call supabase.auth.setSession so the session is established in-app - no
 * credentials are ever typed in the Electron window. Renders nothing on the web.
 */
type DesktopBridge = {
  isDesktop?: boolean;
  signInViaBrowser?: () => Promise<{ ok: boolean }>;
  onAuthSession?: (
    cb: (r: { access_token?: string; refresh_token?: string; error?: string }) => void,
  ) => () => void;
};

function bridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { basichome?: DesktopBridge }).basichome;
}

export function DesktopBrowserSignIn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const bh = bridge();
    if (!bh?.isDesktop || !bh.signInViaBrowser || !bh.onAuthSession) return;
    setAvailable(true);
    const off = bh.onAuthSession(async (r) => {
      if (r.error || !r.access_token || !r.refresh_token) {
        setBusy(false);
        setError(r.error ?? "Sign-in didn’t complete. Try again.");
        return;
      }
      const supabase = createClient();
      const { error: setErr } = await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
      if (setErr) {
        setBusy(false);
        setError(setErr.message);
        return;
      }
      router.replace("/");
      router.refresh();
    });
    return off;
  }, [router]);

  if (!available) return null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          await bridge()?.signInViaBrowser?.();
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? "Waiting for your browser…" : "Sign in via browser ↗"}
      </button>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
