"use client";

import { useState } from "react";

import { toast } from "sonner";
import { GlobeHemisphereWest, Plug } from "@phosphor-icons/react";

import { Plus, Trash2 } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionLogo } from "@/components/connection-logo";
import { Input } from "@/components/ui/input";
import type { ConnectionsData } from "@/lib/connections-data";

/**
 * Connections — apps your agents can talk to, and signed-in sites they can act
 * inside. Styled to match Settings → Integrations: brand logos, status badges,
 * Manage/Disconnect actions. The "Use my cookies" flow uses the desktop bridge
 * to capture a site's local Chrome cookies into the workspace.
 */
export function ConnectionsSimple({ data }: { data: ConnectionsData }) {
  const [toolkits, setToolkits] = useState(data.toolkits);
  const [credentials, setCredentials] = useState(data.credentials);
  const [browserSites, setBrowserSites] = useState(data.browserSites);
  const [siteHost, setSiteHost] = useState("");
  const [capturing, setCapturing] = useState(false);

  const disconnectToolkit = async (slug: string) => {
    if (!confirm(`Disconnect ${slug}?`)) return;
    try {
      const r = await fetch(`/api/connections/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setToolkits(toolkits.filter((t) => t.slug !== slug));
      toast.success(`Disconnected ${slug}.`);
    } catch {
      toast.error("Could not disconnect");
    }
  };
  const disconnectCredential = async (kind: string) => {
    if (!confirm(`Disconnect ${kind}?`)) return;
    try {
      const r = await fetch(`/api/connections/${encodeURIComponent(kind)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setCredentials(credentials.filter((c) => c.kind !== kind));
      toast.success(`Disconnected ${kind}.`);
    } catch {
      toast.error("Could not disconnect");
    }
  };
  const removeSite = async (host: string) => {
    if (!confirm(`Remove saved login for ${host}?`)) return;
    try {
      const r = await fetch(`/api/browser-sites/${encodeURIComponent(host)}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setBrowserSites(browserSites.filter((s) => s.host !== host));
      toast.success(`Removed ${host}.`);
    } catch {
      toast.error("Could not remove");
    }
  };
  const captureCookies = async (host: string) => {
    if (!host) return;
    interface CookieBridge {
      exportLocalCookies?: (host: string) => Promise<{ ok?: boolean; error?: string; count?: number }>;
    }
    const bridge = typeof window !== "undefined"
      ? (window as unknown as { basichome?: CookieBridge }).basichome ?? null
      : null;
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
        setBrowserSites([
          ...browserSites,
          { host, displayName: host, lastVerifiedAt: new Date().toISOString(), expiresAt: null },
        ]);
      } else {
        toast.error(res?.error ?? "Could not capture cookies");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cookie capture failed");
    } finally {
      setCapturing(false);
    }
  };

  const totalApps = toolkits.length + credentials.length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Connections</h1>
        <p className="mt-1 text-foreground/60 text-sm">
          Apps your agents can talk to, and signed-in sites they can act inside.
        </p>
      </header>

      {/* App connections — OAuth'd Composio toolkits + API-key credentials */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Plug weight="fill" className="size-4 text-foreground/70" />
          <h2 className="font-medium text-sm">Apps</h2>
          <Badge variant="outline" className="h-5">{totalApps}</Badge>
        </div>
        {totalApps === 0 ? (
          <Card className="border-dashed bg-foreground/[0.02] py-8 text-center">
            <CardContent>
              <p className="text-foreground/60 text-sm">
                No app connections yet. Connect Gmail, Slack, Notion, etc. from inside an agent.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {toolkits.map((t) => (
              <Card key={`toolkit-${t.slug}`} size="sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <ConnectionLogo slug={t.slug} className="size-7 shrink-0" />
                      <CardTitle className="text-base capitalize">{t.slug.replace(/_/g, " ")}</CardTitle>
                    </div>
                    <Badge>Connected</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-foreground/60 text-xs">
                  {t.fetchedAt ? `Synced ${new Date(t.fetchedAt).toLocaleDateString()}` : "Ready"}
                </CardContent>
                <CardFooter className="justify-end gap-2 border-t-0 pt-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void disconnectToolkit(t.slug)}
                    className="text-foreground/70"
                  >
                    Disconnect
                  </Button>
                </CardFooter>
              </Card>
            ))}
            {credentials.map((c) => (
              <Card key={`cred-${c.id}`} size="sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <ConnectionLogo slug={c.kind} className="size-7 shrink-0" />
                      <CardTitle className="text-base">{c.label ?? c.kind}</CardTitle>
                    </div>
                    <Badge variant={c.status === "active" ? "default" : "outline"}>
                      {c.status ?? "API key"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-foreground/60 text-xs">
                  API key{c.lastUsedAt ? ` · used ${new Date(c.lastUsedAt).toLocaleDateString()}` : ""}
                </CardContent>
                <CardFooter className="justify-end gap-2 border-t-0 pt-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void disconnectCredential(c.kind)}
                    className="text-foreground/70"
                  >
                    Remove
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Browser sessions — per-host cookies, captured from local Chrome */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <GlobeHemisphereWest weight="fill" className="size-4 text-foreground/70" />
          <h2 className="font-medium text-sm">Browser sessions</h2>
          <Badge variant="outline" className="h-5">{browserSites.length}</Badge>
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-xl border bg-foreground/[0.02] p-2 pl-3">
          <Input
            value={siteHost}
            onChange={(e) => setSiteHost(e.target.value)}
            placeholder="x.com"
            className="h-8 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button
            size="sm"
            onClick={() =>
              void captureCookies(
                siteHost.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
              )
            }
            disabled={!siteHost.trim() || capturing}
            className="h-8"
          >
            <Plus className="size-4" />
            {capturing ? "Capturing…" : "Use my cookies"}
          </Button>
        </div>

        {browserSites.length === 0 ? (
          <Card className="border-dashed bg-foreground/[0.02] py-8 text-center">
            <CardContent>
              <p className="text-foreground/60 text-sm">
                No browser sessions saved. Type a site above and tap &ldquo;Use my cookies&rdquo; to capture them from your local Chrome.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {browserSites.map((s) => (
              <Card key={s.host} size="sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <ConnectionLogo slug={s.host} className="size-7 shrink-0" />
                      <CardTitle className="text-base">{s.displayName ?? s.host}</CardTitle>
                    </div>
                    <Badge>Signed in</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-foreground/60 text-xs">
                  {s.lastVerifiedAt ? `Saved ${new Date(s.lastVerifiedAt).toLocaleDateString()}` : "Saved"}
                  {s.expiresAt ? ` · expires ${new Date(s.expiresAt).toLocaleDateString()}` : ""}
                </CardContent>
                <CardFooter className="justify-end gap-2 border-t-0 pt-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void removeSite(s.host)}
                    className="text-foreground/60 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
