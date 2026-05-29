"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { Globe, Plug, TriangleAlertIcon } from "@/icons";

import { Button } from "@/components/ui/button";

type PendingAction = { runId: string; kind: "browser_login" | "connection"; label: string };

function hostLabel(host: string): string {
  const base = host.replace(/\.(com|org|net|io|co|app|dev|so)$/i, "");
  const known: Record<string, string> = { youtube: "YouTube", linkedin: "LinkedIn", gmail: "Gmail", x: "X" };
  return known[base.toLowerCase()] ?? base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Home "waiting on you" banner — surfaces runs blocked needing a browser login
 * or a Composio connection, with one-click actions, so these requests aren't
 * buried inside individual runs. Renders nothing when there's nothing pending.
 */
export function PendingActionsBanner() {
  const [actions, setActions] = useState<PendingAction[]>([]);

  useEffect(() => {
    let on = true;
    fetch("/api/pending-actions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { actions?: PendingAction[] } | null) => {
        if (on && Array.isArray(d?.actions)) setActions(d.actions);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  if (actions.length === 0) return null;

  // Dedupe display by label (a host/toolkit may appear across runs).
  const seen = new Set<string>();
  const items = actions.filter((a) => {
    const k = `${a.kind}:${a.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    /* Hallmark: neutral paper surface + hairline border; amber lives only in the
       icon chip (accent as highlighter, never a full fill). */
    <div className="flex items-start gap-3.5 rounded-xl border bg-card p-4 shadow-sm">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
        <TriangleAlertIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p className="font-semibold text-foreground text-sm">
            {items.length === 1 ? "1 thing needs you to connect" : `${items.length} things need you to connect`}
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            An agent paused because it needs access. Connect it below, then re-run.
          </p>
        </div>
          <div className="flex flex-wrap items-center gap-2">
            {items.map((a) =>
              a.kind === "browser_login" ? (
                <Button key={`b-${a.label}`} asChild size="sm" className="h-8 gap-1.5">
                  <Link href={`/browser?signin=${encodeURIComponent(a.label)}`}>
                    <Globe className="size-3.5" />
                    Sign in to {hostLabel(a.label)}
                  </Link>
                </Button>
              ) : (
                <Button key={`c-${a.label}`} asChild size="sm" variant="outline" className="h-8 gap-1.5">
                  <Link href={`/runs/${a.runId}`}>
                    <Plug className="size-3.5" />
                    Connect {hostLabel(a.label)}
                  </Link>
                </Button>
              ),
            )}
          </div>
        </div>
      </div>
  );
}
