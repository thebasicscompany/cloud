"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CheckCircle2, Globe, KeyRound, Play, RefreshCcw, ShieldCheck, Trash2 } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { domainFromBrowserPrompt, normalizeBrowserDomain } from "@/lib/browser-runtime";
import type { ConnectionBrowserSite } from "@/lib/connections-data";

const STARTER_PROMPT = "Open Hacker News and summarize the first three visible story titles.";
const HOST_RE = /^[a-z0-9.-]+$/;

type SignInState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "live"; host: string; sessionId: string; liveViewUrl: string }
  | { phase: "finalizing"; host: string }
  | { phase: "done"; host: string }
  | { phase: "needs_debug"; host: string }
  | { phase: "error"; message: string };

export function BrowserWorkbench({ savedSites }: { savedSites: ConnectionBrowserSite[] }) {
  const { push, refresh } = useRouter();
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [domain, setDomain] = useState("news.ycombinator.com");
  const [runBusy, setRunBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [signInHost, setSignInHost] = useState("");
  const [signIn, setSignIn] = useState<SignInState>({ phase: "idle" });
  const [isDesktop, setIsDesktop] = useState(false);
  const [removingHost, setRemovingHost] = useState<string | null>(null);

  // Delete a saved login so the user stays in control of what agents can reuse.
  const removeSite = async (host: string) => {
    setRemovingHost(host);
    try {
      const res = await fetch(`/api/browser-sites/${encodeURIComponent(host)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not delete this login.");
      refresh();
    } catch (e) {
      setSignIn({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setRemovingHost(null);
    }
  };

  useEffect(() => {
    const bh = (window as unknown as { basichome?: { exportLocalCookies?: unknown } }).basichome;
    const desktop = typeof bh?.exportLocalCookies === "function";
    setIsDesktop(desktop);
    // Deep-link from the run "Sign in to <host>" banner: /browser?signin=youtube.com
    try {
      const want = new URLSearchParams(window.location.search).get("signin");
      if (want) {
        const host = want.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
        if (host) {
          setSignInHost(host);
          document.getElementById("signin-host")?.scrollIntoView({ behavior: "smooth", block: "center" });
          // The whole point is to reuse the login you already have. On desktop,
          // try the local Chrome cookies first — no re-typing in a cloud window.
          // It falls back gracefully (needs_debug / error) so the manual cloud
          // sign-in is still one click away.
          if (desktop) void useMyLocalLogin(host);
        }
      }
    } catch {
      // no query params — ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Use my local login" — export this host's cookies from the user's local
  // Chrome (via the desktop bridge) and save them so the cloud agent reuses the
  // login. No re-typing a password in a cloud window.
  const useMyLocalLogin = async (hostArg?: string) => {
    const host = (hostArg ?? signInHost).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!host || !HOST_RE.test(host)) {
      setSignIn({ phase: "error", message: 'Enter a valid host like "linkedin.com".' });
      return;
    }
    const bh = (window as unknown as { basichome?: { exportLocalCookies?: (h: string) => Promise<{ ok?: boolean; cookies?: unknown[]; error?: string }> } }).basichome;
    if (!bh?.exportLocalCookies) {
      setSignIn({ phase: "error", message: "This needs the desktop app — open Basics on your computer." });
      return;
    }
    setSignIn({ phase: "finalizing", host });
    try {
      const res = await bh.exportLocalCookies(host);
      if (!res?.ok) {
        const err = res?.error ?? "";
        // Chrome isn't reachable over the debug protocol — guide the user to
        // enable it (same prerequisite browser-harness has), then retry.
        if (/CDP not reachable|no CDP|debug port|ECONNREFUSED/i.test(err)) {
          setSignIn({ phase: "needs_debug", host });
          return;
        }
        throw new Error(err || "Could not read cookies from your local Chrome.");
      }
      const cookies = Array.isArray(res.cookies) ? res.cookies : [];
      if (cookies.length === 0)
        throw new Error(`You're not signed in to ${host} in your Chrome yet — sign in there first, then try again.`);
      const save = await fetch("/api/browser-sites/local-cookies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host, cookies }),
      });
      const data = await save.json();
      if (!save.ok || !data.ok) throw new Error(data.error || "Could not save the login.");
      setSignIn({ phase: "done", host });
      refresh();
    } catch (e) {
      setSignIn({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  // Run a REAL cloud browser run (Browserbase) via the kicker, then open the
  // run detail where the live session + activity trace are embedded.
  const runBrowserTask = async () => {
    const task = prompt.trim() || STARTER_PROMPT;
    const resolvedDomain = normalizeBrowserDomain(domain || domainFromBrowserPrompt(task));
    setRunBusy(true);
    setRunError(null);
    try {
      const site = resolvedDomain ? ` Start at https://${resolvedDomain}/.` : "";
      const goal = `Use the browser to: ${task}.${site}`.trim();
      const res = await fetch("/api/runs/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const data = await res.json();
      if (data.ok && data.runId) {
        push(`/runs/${data.runId}`);
        return;
      }
      setRunError(data.error ?? "Could not start the browser run.");
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunBusy(false);
    }
  };

  // Cookie → cloud-browser: open a Browserbase live-view, the user signs in
  // once inside it, then finalize persists the session cookies into a
  // Browserbase Context the agents reuse. No secrets ever touch basichome.
  const startSignIn = async (rawHost: string) => {
    const host = rawHost.trim().toLowerCase();
    if (!host || !HOST_RE.test(host)) {
      setSignIn({ phase: "error", message: 'Enter a valid host, e.g. "gmail.com".' });
      return;
    }
    setSignIn({ phase: "starting" });
    try {
      const res = await fetch("/api/browser-sites/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host }),
      });
      const data = await res.json();
      if (res.ok && data.session_id && data.live_view_url) {
        setSignIn({ phase: "live", host, sessionId: data.session_id, liveViewUrl: data.live_view_url });
        return;
      }
      setSignIn({ phase: "error", message: data.error ?? "Could not start the sign-in session." });
    } catch (e) {
      setSignIn({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const finalizeSignIn = async () => {
    if (signIn.phase !== "live") return;
    const { host, sessionId } = signIn;
    setSignIn({ phase: "finalizing", host });
    try {
      const res = await fetch("/api/browser-sites/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host, session_id: sessionId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSignIn({ phase: "done", host });
        refresh();
        return;
      }
      setSignIn({ phase: "error", message: data.error ?? "Could not save the session." });
    } catch (e) {
      setSignIn({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Browser</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Run browser tasks in the cloud, and sign in to a site once so your agents can reuse the session.
        </p>
      </header>

      {/* Run a browser task */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold text-base">Run a browser task</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          The agent drives a cloud browser. You can watch it live and take over from the run page.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_240px]">
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-28 resize-none bg-background"
            placeholder="Tell Basics what the browser should do..."
            aria-label="Browser task"
          />
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="browser-domain" className="font-medium text-sm">
                Start at
              </label>
              <input
                id="browser-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.com"
                className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="button" className="w-full" onClick={() => void runBrowserTask()} disabled={runBusy}>
              <Play className="size-4" />
              {runBusy ? "Starting cloud run…" : "Run browser task"}
            </Button>
            {runError ? <p className="text-destructive text-xs">{runError}</p> : null}
          </div>
        </div>
      </section>

      {/* Sign in to a site (cookie → cloud browser) */}
      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-base">Sign in to a site</h2>
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
              Sign in once in a secure cloud window. Basics saves the session so your agents stay
              logged in. Your password is never entered into Basics or stored in logs.
            </p>
          </div>
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="size-3.5" />
            Secrets not logged
          </Badge>
        </div>

        {signIn.phase === "live" || signIn.phase === "finalizing" ? (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                Signing in to <span className="font-medium">{signIn.host}</span> — complete the login below, then save.
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void finalizeSignIn()} disabled={signIn.phase === "finalizing"}>
                  <CheckCircle2 className="size-4" />
                  {signIn.phase === "finalizing" ? "Saving…" : "I've finished signing in"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSignIn({ phase: "idle" })}>
                  Cancel
                </Button>
              </div>
            </div>
            {signIn.phase === "live" ? (
              <iframe
                title={`Sign in to ${signIn.host}`}
                src={signIn.liveViewUrl}
                className="h-[520px] w-full rounded-lg border bg-background"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                allow="clipboard-read; clipboard-write"
              />
            ) : (
              <div className="grid h-[520px] place-items-center rounded-lg border bg-muted/20 text-muted-foreground text-sm">
                Saving your session…
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Passkeys are tied to this device and won't work in the cloud window — use a password or email/Google login
              here, or run on your own Chrome from the desktop app for passkey sites.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <label htmlFor="signin-host" className="font-medium text-sm">
                Site host
              </label>
              <input
                id="signin-host"
                value={signInHost}
                onChange={(event) => setSignInHost(event.target.value)}
                placeholder="gmail.com"
                className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {isDesktop ? (
              <>
                <Button type="button" onClick={() => void useMyLocalLogin()} title="Reuse the login from your local Chrome">
                  <Globe className="size-4" />
                  Use my login
                </Button>
                <Button type="button" variant="outline" onClick={() => void startSignIn(signInHost)} disabled={signIn.phase === "starting"}>
                  <KeyRound className="size-4" />
                  {signIn.phase === "starting" ? "Opening…" : "Sign in manually"}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => void startSignIn(signInHost)} disabled={signIn.phase === "starting"}>
                <KeyRound className="size-4" />
                {signIn.phase === "starting" ? "Opening…" : "Start sign-in"}
              </Button>
            )}
          </div>
        )}
        {isDesktop ? (
          <p className="mt-2 text-muted-foreground text-xs">
            &ldquo;Use my login&rdquo; reuses the login from your own Chrome, so you don&apos;t re-type anything in the cloud window.
          </p>
        ) : null}

        {signIn.phase === "done" ? (
          <p className="mt-3 flex items-center gap-1.5 text-emerald-600 text-sm dark:text-emerald-500">
            <CheckCircle2 className="size-4" />
            Saved {signIn.host}. Agents can now use this session.
          </p>
        ) : null}
        {signIn.phase === "needs_debug" ? (
          <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium text-foreground">Turn on remote debugging in Chrome first</p>
            <p className="mt-1 text-muted-foreground">
              To reuse your local <span className="font-medium">{signIn.host}</span> login, Basics needs to read it from
              your Chrome — which requires remote debugging to be on (one-time):
            </p>
            <ol className="mt-2 ml-4 list-decimal space-y-1 text-muted-foreground">
              <li>Quit Chrome completely.</li>
              <li>
                Relaunch it with debugging on:{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-xs">chrome --remote-debugging-port=9222 --remote-allow-origins=*</code>
              </li>
              <li>Make sure you&apos;re signed in to {signIn.host} there, then click “Use my local login” again.</li>
            </ol>
            <div className="mt-2.5 flex gap-2">
              <Button type="button" size="sm" onClick={() => void useMyLocalLogin()}>
                Try again
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSignIn({ phase: "idle" })}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
        {signIn.phase === "error" ? <p className="mt-3 text-destructive text-sm">{signIn.message}</p> : null}
      </section>

      {/* Saved sites */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="font-semibold text-base">Saved sites</h2>
        {savedSites.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-sm">
            No saved sessions yet. Sign in to a site above to let agents reuse the login.
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {savedSites.map((site) => (
              <li key={site.host} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" />
                    <span className="truncate font-medium text-sm">{site.displayName ?? site.host}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-muted-foreground text-xs">{site.host}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-muted-foreground text-xs">
                    <div>{site.lastVerifiedAt ? `Verified ${formatDate(site.lastVerifiedAt)}` : "Not verified"}</div>
                    {site.expiresAt ? <div>Expires {formatDate(site.expiresAt)}</div> : null}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => void startSignIn(site.host)}>
                    <RefreshCcw className="size-4" />
                    Re-sign in
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => void removeSite(site.host)}
                    disabled={removingHost === site.host}
                  >
                    <Trash2 className="size-4" />
                    {removingHost === site.host ? "Removing…" : "Remove"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
