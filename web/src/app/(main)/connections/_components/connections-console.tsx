"use client";

import { useState } from "react";

import { toast } from "sonner";

import { CheckCircle2, Globe, KeyRound, Loader2, Lock, Plug, RotateCw, TriangleAlertIcon } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectionLogo } from "@/components/connection-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { credentialLabel, formatRelative } from "@/lib/format";
import type {
  ConnectionBrowserSite,
  ConnectionCredential,
  ConnectionsData,
} from "@/lib/connections-data";

/** Active live-view login session held while the operator signs in. */
interface BrowserSiteSession {
  host: string;
  sessionId: string;
  liveViewUrl: string;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** Map a raw credential status to a copy + badge variant. */
function credentialStatusMeta(status: string | null): { label: string; variant: BadgeVariant; attention: boolean } {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "connected" || s === "enabled") {
    return { label: "Connected", variant: "secondary", attention: false };
  }
  if (s === "expired") return { label: "Expired", variant: "destructive", attention: true };
  if (s === "revoked") return { label: "Revoked", variant: "destructive", attention: true };
  if (s === "error" || s === "failed") return { label: "Error", variant: "destructive", attention: true };
  if (s === "not_provisioned" || s === "" || s === "not_connected") {
    return { label: "Not connected", variant: "outline", attention: true };
  }
  return { label: status ?? "Unknown", variant: "outline", attention: true };
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export function ConnectionsConsole({ data }: { data: ConnectionsData }) {
  const [connecting, setConnecting] = useState<string | null>(null);

  // Browser-site live-view login flow.
  const [siteHost, setSiteHost] = useState("");
  const [openingSite, setOpeningSite] = useState<string | null>(null);
  const [session, setSession] = useState<BrowserSiteSession | null>(null);
  const [savingCookies, setSavingCookies] = useState(false);

  /** Normalise a typed host: strip scheme, path, and trailing dots. */
  function normalizeHost(raw: string): string {
    let h = raw.trim().toLowerCase();
    h = h.replace(/^https?:\/\//, "");
    h = h.replace(/\/.*$/, "");
    h = h.replace(/\.+$/, "");
    return h;
  }

  async function openLogin(rawHost: string) {
    const host = normalizeHost(rawHost);
    if (!host || !/^[a-z0-9.-]+$/.test(host)) {
      toast.error("Enter a valid site host, e.g. example.com.");
      return;
    }
    setOpeningSite(host);
    try {
      const res = await fetch("/api/browser-sites/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ host, workspaceId: data.workspaceId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        session_id?: string;
        live_view_url?: string;
        error?: string;
        message?: string;
      };
      if (res.ok && json.session_id && json.live_view_url) {
        setSession({ host, sessionId: json.session_id, liveViewUrl: json.live_view_url });
        toast.success(`Opening a cloud browser for ${host}…`);
      } else {
        toast.error(json.error ?? "Could not start the login session.", {
          description: json.message,
        });
      }
    } catch (err) {
      toast.error("Could not reach the browser-site service.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setOpeningSite(null);
    }
  }

  async function saveCookies() {
    if (!session) return;
    setSavingCookies(true);
    try {
      const res = await fetch("/api/browser-sites/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: session.host,
          session_id: session.sessionId,
          workspaceId: data.workspaceId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (res.ok && json.ok) {
        toast.success(`Saved login for ${session.host}.`, {
          description: "Refresh to see the updated status.",
        });
        setSession(null);
        setSiteHost("");
      } else {
        toast.error(json.error ?? "Could not save the login.", {
          description: json.message,
        });
      }
    } catch (err) {
      toast.error("Could not reach the browser-site service.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingCookies(false);
    }
  }

  async function connect(toolkit: string) {
    setConnecting(toolkit);
    try {
      const res = await fetch("/api/connections/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolkit, workspaceId: data.workspaceId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirectUrl?: string;
        error?: string;
        hint?: string;
      };
      if (json.ok && json.redirectUrl) {
        toast.success(`Opening ${credentialLabel(toolkit)} connection…`);
        window.open(json.redirectUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error(json.error ?? "Could not start the connection.", {
          description: json.hint,
        });
      }
    } catch (err) {
      toast.error("Could not reach the connection service.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setConnecting(null);
    }
  }

  const attentionCount =
    data.credentials.filter((c) => credentialStatusMeta(c.status).attention).length +
    data.browserSites.filter((s) => isExpired(s.expiresAt)).length;

  return (
    <main className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Connections</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            Connect and reconnect Composio toolkits, model credentials, and saved browser logins for
            this workspace. Secret material is never shown here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{data.toolkits.length} toolkits</Badge>
          <Badge variant="outline">{data.credentials.length} credentials</Badge>
          <Badge variant={attentionCount > 0 ? "destructive" : "outline"}>
            {attentionCount} need attention
          </Badge>
        </div>
      </header>

      <ToolkitsCard
        toolkits={data.toolkits}
        connecting={connecting}
        onConnect={connect}
      />

      <CredentialsCard
        credentials={data.credentials}
        connecting={connecting}
        onConnect={connect}
      />

      <BrowserSitesCard
        sites={data.browserSites}
        siteHost={siteHost}
        onSiteHostChange={setSiteHost}
        openingSite={openingSite}
        onOpenLogin={openLogin}
        sessionActive={session !== null}
      />

      <LoginSessionDialog
        session={session}
        savingCookies={savingCookies}
        onSave={saveCookies}
        onClose={() => setSession(null)}
      />
    </main>
  );
}

function LoginSessionDialog({
  session,
  savingCookies,
  onSave,
  onClose,
}: {
  session: BrowserSiteSession | null;
  savingCookies: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={session !== null}
      onOpenChange={(open) => {
        if (!open && !savingCookies) onClose();
      }}
    >
      <DialogContent
        className="flex h-[80vh] max-h-[80vh] w-[calc(100%-2rem)] max-w-4xl flex-col gap-3 sm:max-w-4xl"
        showCloseButton={!savingCookies}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" />
            Sign in to {session?.host ?? "site"}
          </DialogTitle>
          <DialogDescription>
            Log in to this site in the cloud browser below. When you&apos;re fully signed in, choose
            &ldquo;Done — save cookies&rdquo; to capture the session for the agent. Cookie values are
            never shown or stored in this app.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/40">
          {session ? (
            <iframe
              key={session.sessionId}
              src={session.liveViewUrl}
              title={`Live login for ${session.host}`}
              className="h-full w-full border-0"
              // The live view is an interactive Browserbase session; allow it to
              // run the remote browser surface, but keep it sandboxed.
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              allow="clipboard-read; clipboard-write"
            />
          ) : null}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Lock className="size-3" />
            Secure cloud browser — credentials stay in the session.
          </span>
          <Button
            type="button"
            onClick={onSave}
            disabled={savingCookies}
            className="gap-1.5"
            data-testid="save-cookies"
          >
            {savingCookies ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
            Done — save cookies
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolkitsCard({
  toolkits,
  connecting,
  onConnect,
}: {
  toolkits: ConnectionsData["toolkits"];
  connecting: string | null;
  onConnect: (toolkit: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" />
          <CardTitle>Composio toolkits</CardTitle>
        </div>
        <CardDescription>
          Integrations available to this workspace. Connect or reconnect to refresh OAuth access.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {toolkits.length === 0 ? (
          <EmptyRow text="No toolkits cached for this workspace yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Toolkit</TableHead>
                <TableHead className="hidden sm:table-cell">Schema</TableHead>
                <TableHead className="hidden md:table-cell">Last synced</TableHead>
                <TableHead className="w-[160px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {toolkits.map((tk) => (
                <TableRow key={tk.slug}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <ConnectionLogo slug={tk.slug} className="size-6 shrink-0" />
                      <div>
                        <div className="font-medium">{credentialLabel(tk.slug)}</div>
                        <div className="font-mono text-muted-foreground text-xs">{tk.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground text-sm sm:table-cell">
                    v{tk.schemaVersion ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground text-sm md:table-cell">
                    {formatRelative(tk.fetchedAt ?? undefined)}
                  </TableCell>
                  <TableCell className="text-right">
                    <ConnectButton
                      label="Reconnect"
                      toolkit={tk.slug}
                      connecting={connecting}
                      onConnect={onConnect}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CredentialsCard({
  credentials,
  connecting,
  onConnect,
}: {
  credentials: ConnectionCredential[];
  connecting: string | null;
  onConnect: (toolkit: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <CardTitle>Credentials</CardTitle>
        </div>
        <CardDescription>
          Provider credentials for this workspace. Secrets are encrypted at rest and never displayed.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {credentials.length === 0 ? (
          <EmptyRow text="No credentials recorded for this workspace yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Provenance</TableHead>
                <TableHead className="hidden lg:table-cell">Last used</TableHead>
                <TableHead className="w-[160px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((cred) => {
                const meta = credentialStatusMeta(cred.status);
                return (
                  <TableRow key={cred.id} className={meta.attention ? "bg-destructive/5" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <ConnectionLogo slug={cred.kind} className="size-6 shrink-0" />
                        <div>
                          <div className="font-medium">{cred.label ?? credentialLabel(cred.kind)}</div>
                          <div className="font-mono text-muted-foreground text-xs">{cred.kind}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={meta.variant} className="h-auto min-h-5 gap-1 py-0.5">
                        {meta.attention ? (
                          <TriangleAlertIcon className="size-3" />
                        ) : (
                          <CheckCircle2 className="size-3" />
                        )}
                        {meta.label}
                      </Badge>
                      {cred.lastProviderError ? (
                        <div className="mt-1 max-w-[280px] truncate text-destructive text-xs" title={cred.lastProviderError}>
                          {cred.lastProviderError}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground text-sm md:table-cell">
                      {cred.provenance ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground text-sm lg:table-cell">
                      {formatRelative(cred.lastUsedAt ?? undefined)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ConnectButton
                        label={meta.attention ? "Reconnect" : "Manage"}
                        toolkit={cred.kind}
                        connecting={connecting}
                        onConnect={onConnect}
                        highlight={meta.attention}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function BrowserSitesCard({
  sites,
  siteHost,
  onSiteHostChange,
  openingSite,
  onOpenLogin,
  sessionActive,
}: {
  sites: ConnectionBrowserSite[];
  siteHost: string;
  onSiteHostChange: (value: string) => void;
  openingSite: string | null;
  onOpenLogin: (host: string) => void;
  sessionActive: boolean;
}) {
  const busy = openingSite !== null || sessionActive;

  function submitNewSite(e: React.FormEvent) {
    e.preventDefault();
    if (siteHost.trim()) onOpenLogin(siteHost);
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground" />
          <CardTitle>Saved browser logins</CardTitle>
        </div>
        <CardDescription>
          Sites the agent can sign into using saved sessions. Cookies are stored encrypted and never
          displayed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        <form
          onSubmit={submitNewSite}
          className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center"
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="browser-site-host" className="sr-only">
              Site host
            </label>
            <Input
              id="browser-site-host"
              value={siteHost}
              onChange={(e) => onSiteHostChange(e.target.value)}
              placeholder="Add a site to log into, e.g. example.com"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              data-testid="browser-site-host"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            className="gap-1.5"
            disabled={busy || siteHost.trim().length === 0}
            data-testid="open-login"
          >
            {openingSite !== null ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Globe data-icon="inline-start" />
            )}
            Open login
          </Button>
        </form>

        {sites.length === 0 ? (
          <EmptyRow text="No saved browser logins for this workspace yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Last verified</TableHead>
                <TableHead className="hidden lg:table-cell">Expires</TableHead>
                <TableHead className="w-[160px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => {
                const expired = isExpired(site.expiresAt);
                return (
                  <TableRow key={site.host} className={expired ? "bg-destructive/5" : undefined}>
                    <TableCell>
                      <div className="font-medium">{site.displayName ?? site.host}</div>
                      <div className="font-mono text-muted-foreground text-xs">{site.host}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={expired ? "destructive" : "secondary"}
                        className="h-auto min-h-5 gap-1 py-0.5"
                      >
                        {expired ? <TriangleAlertIcon className="size-3" /> : <CheckCircle2 className="size-3" />}
                        {expired ? "Expired" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground text-sm md:table-cell">
                      {formatRelative(site.lastVerifiedAt ?? undefined)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground text-sm lg:table-cell">
                      {site.expiresAt ? new Date(site.expiresAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={expired ? "default" : "outline"}
                        className="gap-1.5"
                        disabled={busy}
                        onClick={() => onOpenLogin(site.host)}
                        data-testid={`relogin-${site.host}`}
                      >
                        {openingSite === site.host ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCw data-icon="inline-start" />
                        )}
                        Re-login
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectButton({
  label,
  toolkit,
  connecting,
  onConnect,
  highlight = false,
}: {
  label: string;
  toolkit: string;
  connecting: string | null;
  onConnect: (toolkit: string) => void;
  highlight?: boolean;
}) {
  const isBusy = connecting === toolkit;
  return (
    <Button
      type="button"
      size="sm"
      variant={highlight ? "default" : "outline"}
      className="gap-1.5"
      disabled={connecting !== null}
      onClick={() => onConnect(toolkit)}
      data-testid={`connect-${toolkit}`}
    >
      {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plug data-icon="inline-start" />}
      {label}
    </Button>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="p-6 text-center text-muted-foreground text-sm">{text}</div>
  );
}
