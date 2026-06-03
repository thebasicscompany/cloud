"use client";

import { useState } from "react";

import { toast } from "sonner";
import { Plug, GlobeHemisphereWest } from "@phosphor-icons/react";

import { Plus, Trash2 } from "@/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConnectionsData } from "@/lib/connections-data";

/**
 * Lean connections view — shows what's connected at a glance.
 *
 *  • App connections (Composio OAuth) — Gmail, Slack, Notion, Linear, etc.
 *  • Browser sessions (per-host cookies) — x.com, github.com, etc.
 *
 * Each row has a Disconnect / Remove. New connections happen from inside
 * the agent creation canvas; this page is for visibility + cleanup.
 */
export function ConnectionsSimple({ data }: { data: ConnectionsData }) {
  const [credentials, setCredentials] = useState(data.credentials);
  const [browserSites, setBrowserSites] = useState(data.browserSites);
  // OAuth'd Composio app connections live on `toolkits` (each row = a slug like
  // "notion", "gmail" the user has signed into). Render them as Apps too.
  const [toolkits, setToolkits] = useState(data.toolkits);
  const [siteHost, setSiteHost] = useState("");
  const [capturing, setCapturing] = useState(false);

  const disconnectApp = async (kind: string) => {
    if (!confirm(`Disconnect ${kind}?`)) return;
    try {
      const r = await fetch(`/api/connections/${encodeURIComponent(kind)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
      setCredentials(credentials.filter((c) => c.kind !== kind));
      toast.success(`Disconnected ${kind}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disconnect");
    }
  };

  const removeSite = async (host: string) => {
    if (!confirm(`Remove saved login for ${host}?`)) return;
    try {
      const r = await fetch(`/api/browser-sites/${encodeURIComponent(host)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
      setBrowserSites(browserSites.filter((s) => s.host !== host));
      toast.success(`Removed ${host}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove");
    }
  };

  const captureCookies = async (host: string) => {
    interface CookieBridge { exportLocalCookies?: (host: string) => Promise<{ ok?: boolean; error?: string; count?: number }> }
    const bridge = (typeof window !== "undefined"
      ? ((window as unknown as { basichome?: CookieBridge }).basichome ?? null)
      : null);
    if (!bridge?.exportLocalCookies) {
      toast.error("Open Basics on your Mac to capture cookies.");
      return;
    }
    setCapturing(true);
    try {
      const res = await bridge.exportLocalCookies(host);
      if (res?.ok) {
        toast.success(`Saved ${host} (${res.count ?? "your"} cookies).`);
        setSiteHost("");
        // The page revalidates on next mount; for now optimistically add.
        setBrowserSites([...browserSites, { host, displayName: host, lastVerifiedAt: new Date().toISOString(), expiresAt: null }]);
      } else {
        toast.error(res?.error ?? "Could not capture cookies");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cookie capture failed");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Connections</h1>
        <p className="mt-1 text-foreground/60 text-sm">
          Apps your agents can talk to, and signed-in sites they can act inside.
        </p>
      </header>

      {/* App connections — Composio OAuth toolkits + API-key credentials. */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Plug weight="fill" className="size-4 text-foreground/70" />
          <h2 className="font-medium text-sm">Apps</h2>
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-foreground/60 text-xs">
            {toolkits.length + credentials.length}
          </span>
        </div>
        {toolkits.length + credentials.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-foreground/[0.02] p-6 text-center text-foreground/60 text-sm">
            No app connections yet. Connect Gmail, Slack, Notion, etc. from inside an agent.
          </div>
        ) : (
          <div className="space-y-2">
            {toolkits.map((t) => (
              <div key={`toolkit-${t.slug}`} className="flex items-center justify-between rounded-xl border bg-card p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm capitalize">{t.slug.replace(/_/g, " ")}</div>
                  <div className="truncate text-foreground/60 text-xs">
                    Connected · {t.fetchedAt ? `synced ${new Date(t.fetchedAt).toLocaleDateString()}` : "ready"}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!confirm(`Disconnect ${t.slug}?`)) return;
                  try {
                    const r = await fetch(`/api/connections/${encodeURIComponent(t.slug)}`, { method: "DELETE" });
                    if (!r.ok) throw new Error();
                    setToolkits(toolkits.filter((x) => x.slug !== t.slug));
                    toast.success(`Disconnected ${t.slug}.`);
                  } catch {
                    toast.error("Could not disconnect");
                  }
                }} className="text-foreground/60 hover:text-destructive">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {credentials.map((c) => (
              <div key={`cred-${c.id}`} className="flex items-center justify-between rounded-xl border bg-card p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm">{c.label ?? c.kind}</div>
                  <div className="truncate text-foreground/60 text-xs">
                    API key · {c.status ?? "unknown"}{c.lastUsedAt ? ` · used ${new Date(c.lastUsedAt).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void disconnectApp(c.kind)} className="text-foreground/60 hover:text-destructive">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Browser sessions (per-host cookies) */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <GlobeHemisphereWest weight="fill" className="size-4 text-foreground/70" />
          <h2 className="font-medium text-sm">Browser sessions</h2>
          <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-foreground/60 text-xs">{browserSites.length}</span>
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-xl border bg-foreground/[0.02] p-2">
          <Input
            value={siteHost}
            onChange={(e) => setSiteHost(e.target.value)}
            placeholder="x.com"
            className="h-8 flex-1 border-0 bg-transparent focus-visible:ring-0"
          />
          <Button
            size="sm"
            onClick={() => void captureCookies(siteHost.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))}
            disabled={!siteHost.trim() || capturing}
            className="h-8"
          >
            <Plus className="size-4" />
            {capturing ? "Capturing…" : "Use my cookies"}
          </Button>
        </div>

        {browserSites.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-foreground/[0.02] p-6 text-center text-foreground/60 text-sm">
            No browser sessions saved. Type a site above and tap "Use my cookies" to capture them from your local Chrome.
          </div>
        ) : (
          <div className="space-y-2">
            {browserSites.map((s) => (
              <div key={s.host} className="flex items-center justify-between rounded-xl border bg-card p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm">{s.displayName ?? s.host}</div>
                  <div className="truncate text-foreground/60 text-xs">
                    {s.lastVerifiedAt ? `Saved ${new Date(s.lastVerifiedAt).toLocaleDateString()}` : "Saved"}
                    {s.expiresAt ? ` · expires ${new Date(s.expiresAt).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void removeSite(s.host)} className="text-foreground/60 hover:text-destructive">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
