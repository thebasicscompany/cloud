"use client";

import { Code2, KeyRound, ShieldCheck } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCodexEngineActions, useCodexEngineStatus } from "@/hooks/queries/use-codex-engine";
import { useSettingsDeveloper } from "@/hooks/queries/use-settings-developer";
import { formatRelative } from "@/lib/format";

const TOKEN_SKELETON_ROWS = ["token-skeleton-1", "token-skeleton-2"];
const TOKEN_SKELETON_COLUMNS = ["label", "token", "created", "last-used"];
const WEBHOOK_SKELETON_ROWS = ["webhook-skeleton-1"];
const WEBHOOK_SKELETON_COLUMNS = ["url", "events", "status"];

export function DeveloperSettingsView() {
  const { data, isLoading } = useSettingsDeveloper();
  const { data: codexStatus, isLoading: codexLoading } = useCodexEngineStatus();
  const codexActions = useCodexEngineActions();

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Developer</h2>
        <p className="text-sm text-muted-foreground">
          API tokens and outbound webhooks for CI and ops hooks. Lens desktop tooling stays separate until v2 control-plane wiring.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-medium text-sm">Engine harnesses</h3>
        <Card size="sm">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="rounded-lg border bg-muted/30 p-2">
                  <Code2 className="size-5 text-primary" />
                </span>
                <div className="min-w-0">
                  <CardTitle className="text-base">Codex</CardTitle>
                  <CardDescription>Local app-building, code/workspace edits, and developer automations.</CardDescription>
                </div>
              </div>
              <Badge variant={codexStatus?.state === "ready" ? "default" : "outline"}>
                {codexStatus ? codexStatusLabel(codexStatus.state) : codexLoading ? "Checking" : "Unknown"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {codexLoading || !codexStatus ? (
              <div className="grid gap-3 md:grid-cols-4">
                {["runtime", "auth", "version", "policy"].map((key) => (
                  <Skeleton key={key} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <EngineFact label="Runtime" value={codexStatus.appServerAvailable ? "App-server + exec" : "Exec JSON"} />
                  <EngineFact label="Auth" value={codexStatus.authMode.replaceAll("_", " ")} />
                  <EngineFact label="Cost" value={codexStatus.costBearer.replaceAll("_", " ")} />
                  <EngineFact label="Version" value={codexStatus.cliVersion ?? "Not detected"} mono />
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <ShieldCheck className="size-4 text-primary" />
                      Policy
                    </div>
                    <div className="mt-2 grid gap-1 text-muted-foreground text-xs sm:grid-cols-2">
                      <span>Filesystem: workspace write with approval</span>
                      <span>Commands: sandboxed and logged</span>
                      <span>Network: blocked by default</span>
                      <span>Cloud: Basics Cloud approval required</span>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <KeyRound className="size-4 text-primary" />
                      Local account
                    </div>
                    <p className="mt-2 truncate font-mono text-muted-foreground text-xs">{codexStatus.cliPath ?? "Codex CLI not detected"}</p>
                    <p className="mt-1 text-muted-foreground text-xs">{formatRelative(codexStatus.lastCheckedAt)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void codexActions.markReady.mutate()}>
                    Mark connected
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void codexActions.markUnauthenticated.mutate()}>
                    Simulate auth expired
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void codexActions.markNotInstalled.mutate()}>
                    Simulate not installed
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-sm">API tokens</h3>
          <Button type="button" size="sm">
            Create token
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Last used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                TOKEN_SKELETON_ROWS.map((rowKey) => (
                  <TableRow key={rowKey}>
                    {TOKEN_SKELETON_COLUMNS.map((columnKey) => (
                      <TableCell key={columnKey}>
                        <Skeleton className="h-4 w-28" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (data?.tokens ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground text-sm">
                    No tokens yet.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.tokens ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.label}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{t.prefix}••••••••</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDay(t.createdAt)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {formatRelative(t.lastUsedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-sm">Webhooks</h3>
          <Button type="button" variant="outline" size="sm">
            Add endpoint
          </Button>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                WEBHOOK_SKELETON_ROWS.map((rowKey) => (
                  <TableRow key={rowKey}>
                    {WEBHOOK_SKELETON_COLUMNS.map((columnKey) => (
                      <TableCell key={columnKey}>
                        <Skeleton className="h-4 w-full max-w-[200px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (data?.webhooks ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-20 text-center text-muted-foreground text-sm">
                    No webhook endpoints configured.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.webhooks ?? []).map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="max-w-[280px] truncate font-mono text-xs">{w.url}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{w.events.join(", ")}</TableCell>
                    <TableCell className="text-sm">{w.enabled ? "Active" : "Paused"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Card size="sm" className="bg-muted/40">
        <CardHeader>
          <CardTitle className="text-base">Lens & desktop</CardTitle>
          <CardDescription>
            Cookie sync and capture daemon settings live in the Lens app for now, not duplicated here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-xs">
          When runtime auth lands, this section will link workspace tokens for local development.
        </CardContent>
      </Card>
    </div>
  );
}

function EngineFact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      <div className={mono ? "mt-2 truncate font-mono text-xs" : "mt-2 font-medium text-sm"}>{value}</div>
    </div>
  );
}

function codexStatusLabel(state: string): string {
  if (state === "ready") return "Ready";
  if (state === "not_installed") return "Not installed";
  if (state === "not_authenticated") return "Reconnect";
  if (state === "blocked_by_policy") return "Blocked";
  return "Unsupported";
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
