"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { ExternalLink, Loader2, Plug, TriangleAlertIcon } from "@/icons";

import { Button } from "@/components/ui/button";

/**
 * Actionable amber banner shown on a run that is blocked because a Composio
 * toolkit isn't connected. Reads the toolkits this run needs from
 * GET /api/runs/[id]/connection-needs (sourced from `connection_expired`
 * activity rows). For each toolkit it offers a one-click "Connect" that mints a
 * Composio OAuth link via POST /api/connections/connect and opens it in a new
 * tab. Renders nothing when the run has no outstanding connection needs.
 */
function titleCase(slug: string): string {
  return slug
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ConnectionNeededBanner({ runId }: { runId: string }) {
  const [toolkits, setToolkits] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/runs/${runId}/connection-needs`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { toolkits?: unknown } | null) => {
        if (!active) return;
        const list = Array.isArray(data?.toolkits)
          ? (data.toolkits as unknown[]).filter((t): t is string => typeof t === "string")
          : [];
        setToolkits(list);
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

  if (toolkits.length === 0) return null;

  const names = toolkits.map(titleCase);
  const label =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-500" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium text-amber-900 text-sm dark:text-amber-200">
              The agent needs {label} connected to finish this.
            </p>
            <p className="text-amber-800/80 text-xs dark:text-amber-300/70">
              Connect {toolkits.length === 1 ? "it" : "them"} so the agent can pick up where it
              left off.
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
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5">
              <Link href="/connections">
                Manage connections
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
