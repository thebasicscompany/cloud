"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { ExternalLink, Globe, Loader2, Plug, TriangleAlertIcon } from "@/icons";

import { Button } from "@/components/ui/button";

/**
 * Actionable amber banner shown on a run blocked because it needs the user to
 * connect something — a Composio toolkit OR a browser login. Reads both from
 * GET /api/runs/[id]/connection-needs:
 *  - toolkits → one-click "Connect" (mints a Composio OAuth link).
 *  - browserSites → one-click "Sign in to <host>" (deep-links the Browser
 *    sign-in flow, prefilled).
 * Renders nothing when the run has no outstanding needs.
 */
function titleCase(slug: string): string {
  return slug
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function hostLabel(host: string): string {
  // "youtube.com" → "YouTube", "linkedin.com" → "LinkedIn", else the bare host.
  const base = host.replace(/\.(com|org|net|io|co|app|dev)$/i, "");
  const known: Record<string, string> = { youtube: "YouTube", linkedin: "LinkedIn", gmail: "Gmail", x: "X" };
  return known[base.toLowerCase()] ?? base.charAt(0).toUpperCase() + base.slice(1);
}

export function ConnectionNeededBanner({ runId }: { runId: string }) {
  const [toolkits, setToolkits] = useState<string[]>([]);
  const [browserSites, setBrowserSites] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [capturingFor, setCapturingFor] = useState<string | null>(null);
  const [capturedHosts, setCapturedHosts] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Push the user's local Chrome cookies for <host> into the workspace via the
  // desktop bridge. Lands in workspace_browser_sites; the agent picks them up
  // when the user clicks Resume (the worker reloads cookies on continue).
  async function useMacCookies(host: string) {
    interface CookieBridge {
      exportLocalCookies?: (host: string) => Promise<{ ok?: boolean; error?: string; count?: number }>;
    }
    const bh = typeof window !== "undefined"
      ? (window as unknown as { basichome?: CookieBridge }).basichome ?? null
      : null;
    if (!bh?.exportLocalCookies) {
      setError("Open Basics on your Mac to use your local cookies.");
      return;
    }
    setCapturingFor(host);
    setError(null);
    try {
      const res = await bh.exportLocalCookies(host);
      if (res?.ok) {
        setCapturedHosts((s) => new Set(s).add(host));
      } else {
        setError(res?.error ?? `Couldn't capture ${host} cookies from Chrome.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cookie capture failed.");
    } finally {
      setCapturingFor(null);
    }
  }

  // Fire a `continue` NOTIFY at the worker so the stuck opencode session
  // re-prompts itself and the agent picks up where it left off. The /message
  // endpoint already implements exactly that NOTIFY path (cloud-runs.ts:361)
  // — we just send a fixed instruction telling the agent the connection is
  // now active. If the binding has expired (worker idle-stopped), the
  // endpoint returns 200 with {steered:false, reason:'not_live'} and the
  // user knows to start a fresh run.
  async function resume() {
    if (resuming || resumed) return;
    setResuming(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message:
            "The connection(s) you needed are now active. Continue from where you left off — re-attempt the tool call that failed with no_connection, and finish the task.",
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { steered?: boolean; reason?: string; error?: string }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "Couldn't resume the run. Try again.");
        return;
      }
      if (data?.steered === false) {
        setError(
          data.reason === "not_live"
            ? "This run isn't live anymore (worker idle-stopped). Start a fresh run — your connection is saved."
            : `Couldn't resume the run (${data.reason ?? "unknown"}).`,
        );
        return;
      }
      setResumed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setResuming(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/runs/${runId}/connection-needs`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { toolkits?: unknown; browserSites?: unknown } | null) => {
        if (!active) return;
        const toList = (v: unknown) =>
          Array.isArray(v) ? (v as unknown[]).filter((t): t is string => typeof t === "string") : [];
        setToolkits(toList(data?.toolkits));
        setBrowserSites(toList(data?.browserSites));
      })
      .catch(() => {
        // Best-effort: a fetch failure just hides the banner.
      });
    return () => {
      active = false;
    };
  }, [runId]);

  async function connect(toolkit: string) {
    if (connecting) return;
    setConnecting(toolkit);
    setError(null);
    try {
      const res = await fetch("/api/connections/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; redirectUrl?: string; error?: string }
        | null;
      if (!res.ok || !data?.ok || !data.redirectUrl) {
        setError(data?.error ?? "Couldn't start the connection. Try again.");
        return;
      }
      // In Electron, `window.open(url, "_blank")` spawns a fresh BrowserWindow
      // with no cookies — so the OAuth flow can't see the user's existing
      // login to e.g. Notion and they have to sign in again. Route through
      // the desktop bridge's openExternal so it lands in the user's real
      // Chrome (default browser) where they're already signed in.
      const bh = (
        window as unknown as {
          basichome?: { isDesktop?: boolean; openExternal?: (url: string) => Promise<{ ok?: boolean }> };
        }
      ).basichome;
      if (bh?.isDesktop && typeof bh.openExternal === "function") {
        void bh.openExternal(data.redirectUrl);
      } else {
        window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setConnecting(null);
    }
  }

  if (toolkits.length === 0 && browserSites.length === 0) return null;

  const names = toolkits.map(titleCase);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          <TriangleAlertIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-semibold text-foreground text-sm">
              This run needs you to connect something to finish.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Connect the items below, then click <strong>Resume run</strong> — the agent will pick up where it left off without restarting from scratch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {toolkits.map((toolkit, i) => (
              <Button
                key={toolkit}
                size="sm"
                onClick={() => void connect(toolkit)}
                disabled={connecting !== null}
                className="h-8 gap-1.5"
              >
                {connecting === toolkit ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plug className="size-3.5" />
                )}
                Connect {names[i]}
              </Button>
            ))}
            {browserSites.map((host) => (
              <div key={host} className="inline-flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void useMacCookies(host)}
                  disabled={capturingFor !== null || capturedHosts.has(host)}
                  className="h-8 gap-1.5"
                  title={`Push your local Chrome cookies for ${host} to the agent`}
                >
                  {capturingFor === host ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Globe className="size-3.5" />
                  )}
                  {capturedHosts.has(host) ? `✓ ${hostLabel(host)} cookies sent` : `Use my ${hostLabel(host)} cookies`}
                </Button>
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                  <Link href={`/browser?signin=${encodeURIComponent(host)}`}>
                    Sign in here
                  </Link>
                </Button>
              </div>
            ))}
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5">
              <Link href={browserSites.length > 0 && toolkits.length === 0 ? "/browser" : "/connections"}>
                {browserSites.length > 0 && toolkits.length === 0 ? "Browser logins" : "Manage connections"}
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={resumed ? "outline" : "default"}
              onClick={() => void resume()}
              disabled={resuming || resumed}
              className="h-8 gap-1.5"
            >
              {resuming ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : null}
              {resumed ? "Resumed — agent is continuing" : "Resume run"}
            </Button>
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      </div>
    </div>
  );
}
