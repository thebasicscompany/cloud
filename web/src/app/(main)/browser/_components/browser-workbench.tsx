"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CheckCircle2, ExternalLink, Eye, Globe, Hand, KeyRound, Lock, Monitor, Pause, Play, RefreshCcw, ShieldCheck, Square } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { browserTargetLabel, browserTargetShortLabel, domainFromBrowserPrompt, normalizeBrowserDomain } from "@/lib/browser-runtime";
import { useBrowserRuntimeActions, useBrowserRuntimeStore } from "@/hooks/queries/use-browser-runtime";
import { useLocalAgentActions, useLocalAgentStore } from "@/hooks/queries/use-local-agent-runtime";
import type { BrowserProfileRecord, BrowserRuntimeTarget } from "@/types/browser-runtime";
import type { LocalAgentRun } from "@/types/local-agent";

const STARTER_PROMPT = "Open Hacker News in a managed browser and summarize the first three visible story titles.";
const LOGIN_DOMAIN = "jobboardpro.example";
const PROFILE_SKELETON_ROWS = ["profile-skeleton-1", "profile-skeleton-2"];

export function BrowserWorkbench() {
  const { data: browserStore, isLoading: browserLoading } = useBrowserRuntimeStore();
  const { data: agentStore } = useLocalAgentStore();
  const browserActions = useBrowserRuntimeActions();
  const agentActions = useLocalAgentActions();
  const [prompt, setPrompt] = useState(STARTER_PROMPT);
  const [domain, setDomain] = useState("news.ycombinator.com");
  const [target, setTarget] = useState<BrowserRuntimeTarget>("local_managed_browser");

  const browserRuns = useMemo(() => (agentStore?.runs ?? []).filter((run) => run.browser), [agentStore?.runs]);
  const latestRun = browserRuns[0];
  const activePrompt = browserStore?.activeLoginPrompt;

  const startBrowserTask = async (requiresLogin = false) => {
    const task = prompt.trim() || STARTER_PROMPT;
    const resolvedDomain = normalizeBrowserDomain(domain || domainFromBrowserPrompt(task));
    const selectedTarget = target === "basics_cloud_browser" ? "basics_cloud" : "local_browser";
    if (requiresLogin) {
      await browserActions.openLogin.mutateAsync(resolvedDomain);
    }
    await browserActions.setDefaultTarget.mutateAsync(target);
    await agentActions.start.mutateAsync({
      prompt: task,
      target: selectedTarget,
      options: {
        browserRuntimeTarget: target,
        browserDomain: resolvedDomain,
        browserUrl: requiresLogin ? `https://${resolvedDomain}/login` : `https://${resolvedDomain}/`,
        requiresLogin,
        userSelectedActiveBrowser: target === "local_visible_browser",
      },
    });
  };

  const openLoginPrompt = async () => {
    const resolvedDomain = normalizeBrowserDomain(domain || LOGIN_DOMAIN);
    setTarget("local_managed_browser");
    setDomain(resolvedDomain);
    setPrompt(`Sign in to ${resolvedDomain} in a managed local browser, then keep the profile on this device for future browser tasks.`);
    await browserActions.openLogin.mutateAsync(resolvedDomain);
    await agentActions.start.mutateAsync({
      prompt: `Sign in to ${resolvedDomain} in a managed local browser.`,
      target: "local_browser",
      options: {
        browserRuntimeTarget: "local_managed_browser",
        browserDomain: resolvedDomain,
        browserUrl: `https://${resolvedDomain}/login`,
        requiresLogin: true,
      },
    });
  };

  const saveLogin = async () => {
    await browserActions.saveLogin.mutateAsync();
  };

  const promoteRun = async (run: LocalAgentRun) => {
    if (!run.browser) return;
    const promotedStore = await agentActions.start.mutateAsync({
      prompt: `Promote to Basics Cloud Browser: ${run.prompt}`,
      target: "basics_cloud",
      options: {
        browserRuntimeTarget: "basics_cloud_browser",
        browserDomain: run.browser.domain,
        browserUrl: run.browser.currentUrl,
        browserTitle: run.browser.pageTitle,
      },
    });
    const promotedRunId = promotedStore.runs[0]?.runId ?? run.runId;
    await browserActions.recordCloudPromotion.mutateAsync({ runId: promotedRunId, domain: run.browser.domain });
  };

  const watchRun = async (run: LocalAgentRun) => {
    if (!run.browser) return;
    await agentActions.watchBrowser.mutateAsync(run.runId);
    await browserActions.setRunViewMode.mutateAsync({ runId: run.runId, mode: "watching" });
  };

  const takeOverRun = async (run: LocalAgentRun) => {
    if (!run.browser) return;
    await agentActions.takeOverBrowser.mutateAsync(run.runId);
    await browserActions.setRunViewMode.mutateAsync({ runId: run.runId, mode: "user_takeover" });
  };

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Browser</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            Local-first browser tasks, on-device managed profiles, explicit active-browser access, and cloud promotion when the work needs to keep running.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Managed local default</Badge>
          <Badge variant="outline">Active browser explicit</Badge>
          <Badge variant="outline">Cloud by approval</Badge>
        </div>
      </header>

      <section className="grid gap-3 lg:grid-cols-4">
        <Metric icon={Monitor} label="Default" value={browserStore ? browserTargetShortLabel(browserStore.defaultTarget) : "Checking"} detail="Generic tasks stay isolated from real tabs." />
        <Metric icon={KeyRound} label="Profiles" value={(browserStore?.profiles.length ?? 0).toString()} detail="On-device saved browser sessions." />
        <Metric icon={Globe} label="Cloud Browser" value="Promotion" detail="Scheduled or overnight work uses Basics Cloud." />
        <Metric icon={ShieldCheck} label="Secrets" value="Not logged" detail="Only metadata and screenshot pointers enter logs." />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border bg-card p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
            <div className="space-y-2">
              <label htmlFor="browser-task-prompt" className="font-medium text-sm">
                Browser task
              </label>
              <Textarea
                id="browser-task-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-28 resize-none bg-background"
                placeholder="Tell basichome what the browser should do..."
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="browser-target" className="font-medium text-sm">
                  Browser target
                </label>
                <NativeSelect id="browser-target" value={target} onChange={(event) => setTarget(event.target.value as BrowserRuntimeTarget)} className="w-full bg-background">
                  <NativeSelectOption value="local_managed_browser">Managed local browser</NativeSelectOption>
                  <NativeSelectOption value="local_visible_browser">Use my active browser</NativeSelectOption>
                  <NativeSelectOption value="local_headless_browser">Background browser</NativeSelectOption>
                  <NativeSelectOption value="basics_cloud_browser">Basics Cloud Browser</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <label htmlFor="browser-domain" className="font-medium text-sm">
                  Site
                </label>
                <input
                  id="browser-domain"
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button type="button" className="w-full" onClick={() => void startBrowserTask(false)} disabled={agentActions.start.isPending}>
                <Play className="size-4" />
                Run browser task
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <TargetFact title="Managed" detail="Separate local profile with saved on-device login." active={target === "local_managed_browser"} />
            <TargetFact title="Active" detail="Only used when this option is selected." active={target === "local_visible_browser"} />
            <TargetFact title="Cloud" detail="For scheduled, overnight, or shared-credential work." active={target === "basics_cloud_browser"} />
          </div>
          {latestRun?.browser ? (
            <div className="mt-4 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">Cloud promotion</div>
                  <p className="text-muted-foreground text-xs">Creates a Basics Cloud Browser run with workspace-credit auth and approval logs.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => void promoteRun(latestRun)}>
                  <Globe className="size-4" />
                  Promote to cloud
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold text-base">Login prompt</h2>
          {activePrompt?.status === "open" ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="font-medium text-sm">Sign in to {activePrompt.domain}</div>
                <p className="mt-1 text-muted-foreground text-xs">
                  Basics keeps this managed browser profile on this device. Cookie values, localStorage values, tokens, and raw headers stay out of logs.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={saveLogin}>
                  <CheckCircle2 className="size-4" />
                  Done, save local profile
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void browserActions.cancelLogin.mutate()}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-muted-foreground text-sm">Open a managed browser login flow without entering secrets into basichome.</p>
              <Button type="button" variant="outline" onClick={openLoginPrompt}>
                <KeyRound className="size-4" />
                Open login prompt
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold text-base">Managed profiles</h2>
          <div className="mt-3 space-y-3">
            {browserLoading ? (
              PROFILE_SKELETON_ROWS.map((key) => <Skeleton key={key} className="h-28 rounded-lg" />)
            ) : (
              (browserStore?.profiles ?? []).map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onRefresh={() => void browserActions.openLogin.mutate(profile.domain)}
                  onRevoke={() => void browserActions.revokeProfile.mutate(profile.id)}
                />
              ))
            )}
          </div>
        </div>

        <LiveBrowserPanel latestRun={latestRun} onWatch={watchRun} onTakeOver={takeOverRun} onStop={(run) => void agentActions.stop.mutate(run.runId)} onPromote={promoteRun} />
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Monitor; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
        <Icon className="size-4" />
        {label}
      </div>
      <div className="mt-2 font-semibold text-lg">{value}</div>
      <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
    </div>
  );
}

function TargetFact({ title, detail, active }: { title: string; detail: string; active: boolean }) {
  return (
    <div className={active ? "rounded-lg border border-primary/40 bg-primary/5 p-3" : "rounded-lg border bg-background p-3"}>
      <div className="font-medium text-sm">{title}</div>
      <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
    </div>
  );
}

function ProfileCard({ profile, onRefresh, onRevoke }: { profile: BrowserProfileRecord; onRefresh: () => void; onRevoke: () => void }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">{profile.label}</div>
          <div className="truncate font-mono text-muted-foreground text-xs">{profile.domain}</div>
        </div>
        <Badge variant={profile.status === "ready" ? "default" : "outline"}>{profileStatusLabel(profile.status)}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <SmallFact label="Cookies" value={profile.cookieCount.toString()} />
        <SmallFact label="Storage" value={profile.localStorageKeyCount.toString()} />
      </div>
      <div className="mt-3 truncate font-mono text-muted-foreground text-[11px]">{profile.storagePath}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCcw className="size-4" />
          Refresh login
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onRevoke}>
          <Lock className="size-4" />
          Revoke
        </Button>
      </div>
    </div>
  );
}

function LiveBrowserPanel({
  latestRun,
  onWatch,
  onTakeOver,
  onStop,
  onPromote,
}: {
  latestRun: LocalAgentRun | undefined;
  onWatch: (run: LocalAgentRun) => void;
  onTakeOver: (run: LocalAgentRun) => void;
  onStop: (run: LocalAgentRun) => void;
  onPromote: (run: LocalAgentRun) => void;
}) {
  if (!latestRun?.browser) {
    return (
      <div className="rounded-lg border border-dashed p-5">
        <h2 className="font-semibold text-base">Live browser</h2>
        <p className="mt-2 text-muted-foreground text-sm">Start a browser task to watch the page, take over, stop it, or promote it to Basics Cloud Browser.</p>
      </div>
    );
  }

  const browser = latestRun.browser;
  const canStop = latestRun.status !== "stopped" && latestRun.status !== "complete" && latestRun.status !== "failed";

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-semibold text-base">Live browser</h2>
          <p className="text-muted-foreground text-sm">{latestRun.taskTitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{browserTargetShortLabel(browser.runtimeTarget)}</Badge>
          <Badge variant="outline">{latestRun.status === "paused" ? "Take-over" : latestRun.status}</Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-red-400/70" />
              <span className="size-2.5 rounded-full bg-amber-400/70" />
              <span className="size-2.5 rounded-full bg-emerald-400/70" />
            </div>
            <div className="ml-2 flex-1 truncate rounded bg-background px-2 py-1 font-mono text-muted-foreground text-xs">{browser.currentUrl}</div>
          </div>
          <div className="grid min-h-72 place-items-center bg-muted/20 p-6 text-center">
            <div>
              <Monitor className="mx-auto size-10 text-muted-foreground/50" />
              <div className="mt-3 font-semibold">{browser.pageTitle}</div>
              <p className="mt-1 text-muted-foreground text-sm">
                {browser.loginRequired ? "Waiting for the user to sign in inside the managed browser." : "Browser task is running with watch, take-over, stop, and cloud promotion controls."}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Button type="button" variant="outline" onClick={() => onWatch(latestRun)}>
            <Eye className="size-4" />
            Watch
          </Button>
          <Button type="button" variant="outline" onClick={() => onTakeOver(latestRun)}>
            <Hand className="size-4" />
            Take over
          </Button>
          <Button type="button" variant="outline" onClick={() => onStop(latestRun)} disabled={!canStop}>
            {latestRun.status === "paused" ? <Pause className="size-4" /> : <Square className="size-4" />}
            Stop
          </Button>
          <Button type="button" variant="outline" onClick={() => onPromote(latestRun)}>
            <Globe className="size-4" />
            Cloud
          </Button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <SmallFact label="Run" value={latestRun.runId} mono />
          <SmallFact label="Domain" value={browser.domain} />
          <SmallFact label="Screenshot" value={browser.screenshotRef ?? "Not captured"} mono />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href={`/runs/${latestRun.runId}`} prefetch={false}>
              <ExternalLink className="size-4" />
              Run detail
            </Link>
          </Button>
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href="/logs" prefetch={false}>
              Logs
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SmallFact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 p-2">
      <div className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</div>
      <div className={mono ? "mt-1 truncate font-mono text-[11px]" : "mt-1 truncate font-medium text-xs"}>{value}</div>
    </div>
  );
}

function profileStatusLabel(status: BrowserProfileRecord["status"]): string {
  if (status === "ready") return "Ready";
  if (status === "needs_login") return "Login";
  if (status === "expired") return "Expired";
  return "Revoked";
}
