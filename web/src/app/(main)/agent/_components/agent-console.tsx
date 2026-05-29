"use client";

import { useRouter } from "next/navigation";

import { Globe, KeyRound, Lock, ShieldCheck, Workflow, Wrench } from "@/icons";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import type { AgentData, WorkspaceSummary } from "@/lib/agent-data";

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex min-w-28 flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2">
      <span className="text-2xl font-semibold tabular-nums leading-none">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {hint ? <span className="text-[11px] text-muted-foreground/80">{hint}</span> : null}
    </div>
  );
}

function statusVariant(status: string | null): "secondary" | "destructive" | "outline" {
  const s = (status ?? "").toLowerCase();
  if (s === "connected" || s === "active" || s === "ok") return "secondary";
  if (s === "error" || s === "revoked" || s === "expired" || s === "disconnected") return "destructive";
  return "outline";
}

export function AgentConsole({
  data,
  workspaces,
  selectedWorkspaceId,
}: {
  data: AgentData;
  workspaces: WorkspaceSummary[];
  selectedWorkspaceId: string | null;
}) {
  const { metrics } = data;
  const { push } = useRouter();
  const onWorkspaceChange = (value: string) =>
    push(value === "all" ? "/agent" : `/agent?ws=${value}`);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Workflow className="size-5 text-foreground" />
            <h1 className="text-xl font-semibold">Agent</h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Live view of the opencode self-healing cloud worker: the skills and helper modules it
            authors, the managed-browser cookie sessions it reuses, and the Composio / direct-auth
            connections it acts through. Cookie values and credential secrets stay redacted.
          </p>
        </div>
        {workspaces.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Workspace context</span>
            <Select defaultValue={selectedWorkspaceId ?? "all"} onValueChange={onWorkspaceChange}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="All workspaces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workspaces</SelectItem>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} · {w.slug ?? w.id.slice(0, 8)} · {w.skills} skills · {w.runs} runs
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </header>

      {!data.configured ? (
        <Card>
          <CardHeader>
            <CardTitle>Backend not connected</CardTitle>
            <CardDescription>
              Set <code className="font-mono text-xs">SUPABASE_URL</code> and{" "}
              <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> so basichome can
              read the live agent data from the Basics project.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Metric label="Skills" value={metrics.skills} hint={`${metrics.pendingSkills} pending review`} />
            <Metric label="Helper modules" value={metrics.helpers} />
            <Metric label="Browser sites" value={metrics.browserSites} />
            <Metric label="Sessions" value={metrics.totalSessions} hint={`${metrics.activeSessions} active`} />
            <Metric label="Connections" value={metrics.connections} hint={`${metrics.connectedCount} connected`} />
            <Metric label="Composio toolsets" value={metrics.toolkits} />
          </div>

          <Tabs defaultValue="skills" className="w-full">
            <TabsList>
              <TabsTrigger value="skills">
                <Wrench className="size-4" /> Skills
              </TabsTrigger>
              <TabsTrigger value="helpers">
                <Workflow className="size-4" /> Helpers
              </TabsTrigger>
              <TabsTrigger value="browser">
                <Globe className="size-4" /> Browser cookies
              </TabsTrigger>
              <TabsTrigger value="connections">
                <KeyRound className="size-4" /> Connections
              </TabsTrigger>
            </TabsList>

            {/* Skills */}
            <TabsContent value="skills" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Learned skills</CardTitle>
                  <CardDescription>
                    Reusable playbooks the agent wrote from successful runs (`skill_write`). Pending
                    rows are invisible to the LLM until a human approves them.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.skills.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No skills yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Integrations</TableHead>
                          <TableHead className="text-right">Confidence</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.skills.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="max-w-[22rem]">
                              <div className="font-medium">{s.name}</div>
                              {s.description ? (
                                <div className="truncate text-xs text-muted-foreground">{s.description}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {[s.kind, s.host].filter(Boolean).join(" · ") || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {s.requiresIntegrations.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  s.requiresIntegrations.map((i) => (
                                    <Badge key={i} variant="outline" className="font-mono text-[11px]">
                                      {i}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {s.confidence == null ? "—" : `${Math.round(s.confidence * 100)}%`}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Badge variant={s.active ? "secondary" : "outline"}>
                                  {s.active ? "Active" : "Inactive"}
                                </Badge>
                                {s.pendingReview ? <Badge variant="outline">Pending</Badge> : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Helpers */}
            <TabsContent value="helpers" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agent helper modules</CardTitle>
                  <CardDescription>
                    TypeScript pipeline modules the agent authored (`helper_write`). On the
                    dispatcher fast-path they can run directly, skipping the LLM hot loop.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.helpers.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No helpers yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Version</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.helpers.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell className="font-mono text-sm">{h.name}</TableCell>
                            <TableCell className="max-w-[28rem] truncate text-xs text-muted-foreground">
                              {h.description ?? "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">v{h.version ?? 1}</TableCell>
                            <TableCell>
                              <Badge variant={h.active ? "secondary" : "outline"}>
                                {h.active ? "Active" : "Superseded"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Browser cookies */}
            <TabsContent value="browser" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    Managed-browser cookie sessions
                    <Badge variant="outline" className="gap-1 font-normal">
                      <Lock className="size-3" /> values redacted
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Saved login state per site reused across managed-browser runs. The cookie blob
                    (`storage_state_json`) is never read by basichome — only metadata is shown.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.browserSessions.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No saved sites yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Site</TableHead>
                          <TableHead>Captured via</TableHead>
                          <TableHead>Last verified</TableHead>
                          <TableHead>Expires</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.browserSessions.map((b) => (
                          <TableRow key={b.host}>
                            <TableCell>
                              <div className="font-medium">{b.displayName ?? b.host}</div>
                              <div className="text-xs text-muted-foreground">{b.host}</div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{b.capturedVia ?? "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatRelative(b.lastVerifiedAt ?? undefined)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatRelative(b.expiresAt ?? undefined)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Connections */}
            <TabsContent value="connections" className="mt-4">
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className="size-4" /> Credentials &amp; connections
                      <Badge variant="outline" className="gap-1 font-normal">
                        <Lock className="size-3" /> secrets redacted
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Composio and direct-auth credentials the agent acts through. Ciphertext is
                      KMS-encrypted and never selected by basichome.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.connections.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">No connections yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Connection</TableHead>
                            <TableHead>Kind</TableHead>
                            <TableHead>Source</TableHead>
                            <TableHead>Last used</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.connections.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium">
                                {c.label?.trim() ? c.label : (c.kind ?? c.id.slice(0, 8))}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{c.kind ?? "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{c.provenance ?? "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {formatRelative(c.lastUsedAt ?? undefined)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusVariant(c.status)}>{c.status ?? "unknown"}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Cached Composio toolsets</CardTitle>
                    <CardDescription>Tool schemas the worker resolves Composio calls against.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.toolkits.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">No cached toolsets.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {data.toolkits.map((t) => (
                          <div
                            key={t.toolkitSlug}
                            className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2"
                          >
                            <span className="font-mono text-sm">{t.toolkitSlug}</span>
                            <span className="text-xs text-muted-foreground">
                              {t.toolCount} tools · {formatRelative(t.fetchedAt ?? undefined)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
