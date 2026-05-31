"use client";

import { useSearchParams } from "next/navigation";

import { useState } from "react";
import { siGoogle } from "simple-icons";
import { toast } from "sonner";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/** Desktop bridge surface (Electron only) for external-browser OAuth. */
type DesktopAuth = {
  openExternalAuth?: (url: string) => Promise<{ ok: boolean }>;
  onAuthCode?: (cb: (r: { code: string | null; error: string | null }) => void) => () => void;
};
// Must match desktop/auth-external.js AUTH_PORT and be allowlisted in Supabase
// (Authentication → URL Configuration → Redirect URLs).
const DESKTOP_REDIRECT = "http://127.0.0.1:38765/callback";

export function GoogleButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const params = useSearchParams();
  const [isPending, setIsPending] = useState(false);

  const onClick = async () => {
    setIsPending(true);
    const supabase = createClient();
    const redirect = params.get("redirect") ?? "/";
    const bh = (window as unknown as { basichome?: DesktopAuth }).basichome;

    // Desktop: open OAuth in the user's REAL browser (Google blocks embedded
    // webviews). The app's loopback captures the code; we exchange it HERE so
    // the session is created inside the app, not the external browser.
    if (bh?.openExternalAuth && bh.onAuthCode) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { skipBrowserRedirect: true, redirectTo: DESKTOP_REDIRECT },
      });
      if (error || !data?.url) {
        setIsPending(false);
        toast.error("Google sign-in failed", { description: error?.message });
        return;
      }
      const off = bh.onAuthCode(async ({ code, error: cbErr }) => {
        off();
        if (!code) {
          setIsPending(false);
          toast.error("Sign-in didn’t complete", { description: cbErr ?? undefined });
          return;
        }
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exErr) {
          setIsPending(false);
          toast.error("Sign-in failed", { description: exErr.message });
          return;
        }
        window.location.assign(redirect);
      });
      await bh.openExternalAuth(data.url);
      return;
    }

    // Web: standard in-browser redirect.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });
    if (error) {
      setIsPending(false);
      toast.error("Google sign-in failed", { description: error.message });
    }
  };

  return (
    <Button variant="secondary" className={cn(className)} onClick={onClick} disabled={isPending} {...props}>
      <SimpleIcon icon={siGoogle} className="size-4" />
      {isPending ? "Continue in your browser…" : "Continue with Google"}
    </Button>
  );
}
