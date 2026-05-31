"use client";

import { useEffect, useState } from "react";

import { ExternalLink, Hand, Maximize2, Monitor } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrbitRing } from "@/components/ui/orbit-ring";
import { cn } from "@/lib/utils";
import type { Run } from "@/types/runs";

const LIVE_STATUSES = new Set(["pending", "booting", "running", "paused", "paused_by_user", "verifying"]);

type Props = {
  run: Run;
  takeover: boolean;
  fullBleed?: boolean;
  onToggleTakeover: () => void;
};

export function LiveView({ run, takeover, fullBleed, onToggleTakeover }: Props) {
  const isLive = LIVE_STATUSES.has(run.status);
  // Only embed the live Browserbase view while the session is actually live.
  // Completed runs show a recording (if any); non-browser runs show the result.
  const liveSession = isLive && Boolean(run.liveUrl);
  // Model B "run on my Chrome": the worker drove the user's LOCAL Chrome via the
  // relay — no Browserbase session and no in-app live view (they watch their own
  // window). Detected by the synthetic `local-relay:` session id.
  const isLocalRun = (run.browserbaseSessionId ?? "").startsWith("local-relay:");

  // The stored liveUrl is pinned to the session's first tab (about:blank). While
  // the run is live, poll for the ACTIVE tab's view so the embed follows the
  // agent's real work instead of showing a blank page (#32).
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!liveSession) {
      setActiveUrl(null);
      setPageUrl(null);
      return;
    }
    let on = true;
    const poll = () => {
      fetch(`/api/runs/${run.id}/live-view`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { liveViewUrl?: string | null; pageUrl?: string | null } | null) => {
          if (!on) return;
          if (d?.liveViewUrl) setActiveUrl(d.liveViewUrl);
          setPageUrl(d?.pageUrl ?? null);
        })
        .catch(() => {});
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [liveSession, run.id]);

  // "Agent is getting started…" is only meaningful for the brief planning window
  // before the agent navigates. The active-tab URL probe (pageUrl) can lag well
  // behind reality, so after a short grace period we stop covering the live view
  // — better to show the agent's real browser than to overstay a blank overlay.
  const [pastGrace, setPastGrace] = useState(false);
  useEffect(() => {
    if (!liveSession) {
      setPastGrace(false);
      return;
    }
    setPastGrace(false);
    // Keep the "getting started" cover brief — once the session is up the real
    // browser (even a blank planning tab) is more reassuring than an overlay
    // that overstays and reads as "still loading forever".
    const t = setTimeout(() => setPastGrace(true), 8000);
    return () => clearTimeout(t);
  }, [liveSession, run.id]);

  // The agent's tab is still blank (booting, planning, or waiting on a sign-in).
  // Show that instead of a bare white frame, which reads like a broken page —
  // but only for the first few seconds, so it never overstays the live view.
  const onBlank = liveSession && (!pageUrl || pageUrl.startsWith("about:")) && !pastGrace;
  const embedUrl = liveSession ? (activeUrl ?? run.liveUrl) : run.recordingUrl;
  const externalUrl = embedUrl;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Monitor className="size-4 text-muted-foreground" />
          <span className="font-medium">{isLocalRun ? (isLive ? "Your Chrome (live)" : "Ran in your Chrome") : run.executionTarget ? liveTitleFor(run.executionTarget, isLive) : isLive ? "Live browser" : "Run result"}</span>
          {takeover && liveSession && (
            <Badge variant="secondary" className="h-auto min-h-5 gap-1 py-0.5">
              <Hand data-icon="inline-start" />
              You're driving
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!fullBleed && liveSession && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={onToggleTakeover}>
              <Maximize2 className="size-3.5" />
              {takeover ? "Exit" : "Take over"}
            </Button>
          )}
          {externalUrl && (
            <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2">
              <a href={externalUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                {liveSession ? "Open live" : "Watch recording"}
              </a>
            </Button>
          )}
          {fullBleed && liveSession && (
            <Button size="sm" variant="default" className="h-7 gap-1 px-2" onClick={onToggleTakeover}>
              Exit take-over
            </Button>
          )}
        </div>
      </div>
      <div className={cn("relative flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-4", fullBleed && "p-0")}>
        {liveSession || run.recordingUrl ? (
          <div
            className={cn(
              "relative flex aspect-[16/10] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-background shadow-sm",
              fullBleed && "h-full max-w-none rounded-none",
            )}
          >
            <BrowserChrome
              url={
                liveSession && pageUrl && !pageUrl.startsWith("about:")
                  ? pageUrl
                  : run.browserUrl ?? (liveSession ? "browserbase · live session" : "browserbase · recording")
              }
            />
            <div className="relative w-full flex-1">
              <iframe
                src={embedUrl ?? undefined}
                title={liveSession ? "Browserbase live view" : "Run recording"}
                className="h-full w-full border-0 bg-white"
                // The Browserbase live view is an interactive remote browser: it
                // needs pointer-lock (mouse capture), popups, modals and downloads
                // to behave like the real tab. A too-tight sandbox is why the
                // embedded view stalled while "Open live" (an unsandboxed tab)
                // worked. Same-origin is required for its own websocket/auth.
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-pointer-lock"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
              {onBlank ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/85 text-center backdrop-blur-sm">
                  <OrbitRing />
                  <p className="font-medium text-sm">Agent is getting started…</p>
                  <p className="max-w-xs text-muted-foreground text-xs">
                    The browser is open but hasn&apos;t loaded a page yet — it&apos;s planning, or waiting on a
                    sign-in. The view follows along as soon as it navigates.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex max-w-lg flex-col items-center gap-3 rounded-lg border bg-card p-6 text-center">
            <Monitor className="size-9 text-muted-foreground/40" />
            <p className="font-medium text-sm">
              {isLocalRun
                ? isLive
                  ? "Running in your Chrome"
                  : "Ran in your Chrome"
                : isLive
                  ? "Starting browser session…"
                  : run.browserbaseSessionId
                    ? "Browser session ended"
                    : "This run didn't use a browser"}
            </p>
            <p className="text-muted-foreground text-sm">
              {isLocalRun
                ? "This run drives your own Chrome window — there's no in-app browser view for a local run. Watch it in Chrome; the timeline on the left logs every action, and the result is in the Output panel."
                : isLive
                  ? "The agent hasn't opened a browser session yet — follow the steps on the left."
                  : run.browserbaseSessionId
                    ? "The live view is only available while a run is active. The tools & reasoning timeline on the left shows every browser action it took — the result is in the Output panel."
                    : "See the tools & reasoning timeline on the left for exactly what happened — the result is in the Output panel."}
            </p>
            {run.browserbaseSessionId && !isLive ? (
              <p className="font-mono text-muted-foreground/70 text-xs">
                {isLocalRun ? "your local Chrome · session ended" : `browser session ${run.browserbaseSessionId.slice(0, 8)} · closed`}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function liveTitleFor(target: string, isLive: boolean): string {
  if (target === "local_device") return isLive ? "Local device run" : "Final local state";
  if (target === "local_browser") return isLive ? "Local browser run" : "Final browser state";
  if (target === "local_app") return isLive ? "Local app runtime" : "Final app state";
  if (target === "codex_app_server") return isLive ? "Codex app-server run" : "Codex app-server result";
  if (target === "codex_exec") return isLive ? "Codex exec JSON run" : "Codex exec result";
  if (target === "basics_cloud") return isLive ? "Basics Cloud run" : "Cloud run result";
  return isLive ? "Live run" : "Final run state";
}

function BrowserChrome({ url }: { url: string }) {
  return (
    <div className="flex w-full items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
      <div className="flex gap-1.5">
        <span className="size-2.5 rounded-full bg-red-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-emerald-400/70" />
      </div>
      <div className="ml-2 flex-1 truncate rounded bg-background px-2 py-0.5 font-mono text-muted-foreground text-xs">
        {url}
      </div>
    </div>
  );
}


