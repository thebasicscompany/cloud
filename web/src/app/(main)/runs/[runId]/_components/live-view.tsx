"use client";

import { ExternalLink, Hand, Maximize2, Monitor } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <Monitor className="size-4 text-muted-foreground" />
          <span className="font-medium">{run.executionTarget ? liveTitleFor(run.executionTarget, isLive) : isLive ? "Live browser" : "Final browser state"}</span>
          {takeover && (
            <Badge variant="secondary" className="h-auto min-h-5 gap-1 py-0.5">
              <Hand data-icon="inline-start" />
              You're driving
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!fullBleed && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={onToggleTakeover}>
              <Maximize2 className="size-3.5" />
              {takeover ? "Exit" : "Take over"}
            </Button>
          )}
          {run.liveUrl && (
            <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2">
              <a href={run.liveUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Open
              </a>
            </Button>
          )}
          {fullBleed && (
            <Button size="sm" variant="default" className="h-7 gap-1 px-2" onClick={onToggleTakeover}>
              Exit take-over
            </Button>
          )}
        </div>
      </div>
      <div className={cn("relative flex flex-1 items-center justify-center bg-muted/30 p-4", fullBleed && "p-0")}>
        <div
          className={cn(
            "relative flex aspect-[16/10] w-full max-w-4xl flex-col items-center justify-center overflow-hidden rounded-lg border bg-background shadow-sm",
            fullBleed && "h-full max-w-none rounded-none",
          )}
        >
          <BrowserChrome url={fakeUrlFor(run)} />
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Monitor className="size-10 opacity-30" />
            <p className="max-w-sm text-sm">
              {run.executionTarget ? localRunDescription(run, isLive) : `Browserbase live URL renders here in production. ${isLive ? "(Streaming)" : "(Final frame)"}`}
            </p>
          </div>
        </div>
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

function localRunDescription(run: Run, isLive: boolean): string {
  const target = run.executionTarget;
  if (run.browserRuntimeTarget) {
    const label = browserRuntimeLabel(run.browserRuntimeTarget);
    const page = run.browserTitle && run.browserDomain ? `${run.browserTitle} on ${run.browserDomain}` : run.browserDomain ?? "the selected site";
    return `${label} renders here with watch, take-over, stop, and cloud promotion controls. ${isLive ? `Current page: ${page}.` : "Final browser state."}`;
  }
  if (target === "basics_cloud") return `Basics Cloud live view and worker logs render here in production. ${isLive ? "(Cloud stream active)" : "(Cloud result)"}`;
  if (target === "codex_app_server") return `Codex app-server thread events render here through Basics logs and policy. ${isLive ? "(Codex stream active)" : "(Codex result)"}`;
  if (target === "codex_exec") return `Codex exec JSONL events render here after Basics policy projection. ${isLive ? "(Codex JSON stream active)" : "(Codex result)"}`;
  if (target === "local_browser") return `Managed local browser activity renders here. ${isLive ? "(Local stream active)" : "(Final local browser state)"}`;
  if (target === "local_app") return `Local app/tool runtime activity renders here. ${isLive ? "(Local app worker active)" : "(Final app state)"}`;
  return `Local device tool activity renders here. ${isLive ? "(Local stream active)" : "(Final local state)"}`;
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

function fakeUrlFor(run: Run): string {
  if (run.browserUrl) return run.browserUrl;
  const map: Record<string, string> = {
    wf_invoice_chase: "app.qbo.intuit.com/app/reports/ar-aging",
    wf_lead_enrich: "app.hubspot.com/contacts/list/all",
    wf_slack_digest: "app.slack.com/client/T0123/C0LEAD",
    wf_zendesk_triage: "yourco.zendesk.com/agent/dashboard",
    wf_inventory_sync: "admin.shopify.com/store/inventory",
  };
  return map[run.workflowId] ?? "local://basichome/run";
}

function browserRuntimeLabel(target: string): string {
  if (target === "local_visible_browser") return "Active browser";
  if (target === "local_headless_browser") return "Background browser";
  if (target === "basics_cloud_browser") return "Basics Cloud Browser";
  return "Managed local browser";
}
