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
  const [error, setError] = useState<string | null>(null);

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
      window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setConnecting(null);
    }
  }

  if (toolkits.length === 0 && browserSites.length === 0) return null;

  const names = toolkits.map(titleCase);

  return (
    <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
      <div className="flex items-start gap-3">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-0.5">
            <p className="font-semibold text-foreground text-sm">
              This run needs you to connect something to finish.
            </p>
            <p className="text-foreground/70 text-sm">
              Connect the items below, then re-run — the agent will pick up where it left off.
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
              <Button key={host} asChild size="sm" className="h-8 gap-1.5">
                <Link href={`/browser?signin=${encodeURIComponent(host)}`}>
                  <Globe className="size-3.5" />
                  Sign in to {hostLabel(host)}
                </Link>
              </Button>
            ))}
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5">
              <Link href={browserSites.length > 0 && toolkits.length === 0 ? "/browser" : "/connections"}>
                {browserSites.length > 0 && toolkits.length === 0 ? "Browser logins" : "Manage connections"}
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          </div>

          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
      </div>
    </div>
  );
}
