"use client";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";

import { ChevronRight, Wrench } from "@/icons";

import { LocalAgentWorkbench } from "@/app/(main)/_components/local-agent-workbench";
import { PendingCard } from "@/app/(main)/approvals/_components/pending-card";
import { StatusPill } from "@/app/(main)/runs/_components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isPendingApproval, useApprovals } from "@/hooks/queries/use-approvals";
import { useRuns } from "@/hooks/queries/use-runs";
import { resolveAppIcon } from "@/lib/app-icons";
import { formatRelative } from "@/lib/format";
import type { DocSummary } from "@/lib/documents-data";

type AgentRow = { id: string; name: string; goal: string | null; status: string | null };

function useDocuments() {
  return useQuery({
    queryKey: ["documents-list"],
    queryFn: async (): Promise<DocSummary[]> => {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) return ((await res.json()).documents ?? []) as DocSummary[];
      } catch {
        // offline — empty
      }
      return [];
    },
  });
}

function useAgents() {
  return useQuery({
    queryKey: ["agents-list"],
    queryFn: async (): Promise<AgentRow[]> => {
      try {
        const res = await fetch("/api/automations");
        if (res.ok) return ((await res.json()).agents ?? []) as AgentRow[];
      } catch {
        // offline — empty
      }
      return [];
    },
  });
}

export function HomeDashboard() {
  const { data: runs } = useRuns({});
  const { data: approvals } = useApprovals({});
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: documents } = useDocuments();

  const recentDocs = (documents ?? []).slice(0, 4);
  const recent = (runs ?? []).slice(0, 6);
  const pending = (approvals ?? []).filter(isPendingApproval).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <header className="space-y-1 pt-2">
        <h1 className="font-semibold text-2xl tracking-tight">basichome</h1>
        <p className="text-muted-foreground text-sm">
          Talk to your agent, run work locally or in the cloud, and review what it produced.
        </p>
      </header>

      {/* Hero — talk to the agent */}
      <Card>
        <CardContent className="pt-6">
          <LocalAgentWorkbench />
        </CardContent>
      </Card>

      {pending.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="Needs your decision" href="/approvals" action="All approvals" />
          <div className="space-y-2">
            {pending.map((approval) => (
              <PendingCard key={approval.id} approval={approval} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeader title="Your agents" href="/automations" action="Manage" />
        {agentsLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {["a", "b", "c"].map((k) => (
              <Skeleton key={k} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (agents ?? []).length === 0 ? (
          <EmptyLine text="No agents yet. Ask basichome to do something, then save it as a reusable agent." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(agents ?? []).slice(0, 6).map((agent) => (
              <Link
                key={agent.id}
                href={`/automations/${agent.id}`}
                prefetch={false}
                className="group rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <div className="flex items-center gap-2">
                  <Wrench className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium text-sm">{agent.name}</span>
                </div>
                {agent.goal ? (
                  <p className="mt-2 line-clamp-2 text-muted-foreground text-xs">{agent.goal}</p>
                ) : null}
                <Badge variant={agent.status === "active" ? "secondary" : "outline"} className="mt-3">
                  {agent.status ?? "draft"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>

      {recentDocs.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="Recent documents" href="/documents" action="All documents" />
          <div className="grid gap-3 sm:grid-cols-2">
            {recentDocs.map((doc) => {
              const Icon = resolveAppIcon({ icon: doc.icon, name: doc.title });
              return (
                <Link
                  key={doc.id}
                  href="/documents"
                  prefetch={false}
                  className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" weight="duotone" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-sm">{doc.title}</div>
                    <p className="mt-0.5 line-clamp-1 text-muted-foreground text-xs">{doc.summary}</p>
                    <div className="mt-1 truncate text-muted-foreground text-[11px]">{doc.source.label}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeader title="Recent work" href="/runs" action="All runs" />
        {!runs ? (
          <div className="space-y-2">
            {["r1", "r2", "r3", "r4"].map((k) => (
              <Skeleton key={k} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyLine text="No runs yet. Start one above and it'll show up here." />
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {recent.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                prefetch={false}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm">{run.workflowName}</div>
                  <div className="truncate font-mono text-muted-foreground text-xs">{run.id}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusPill status={run.status} />
                  <span className="text-muted-foreground text-xs">{formatRelative(run.startedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({ title, href, action }: { title: string; href: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="font-semibold text-base tracking-tight">{title}</h2>
      <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" asChild>
        <Link href={href} prefetch={false}>
          {action}
          <ChevronRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-sm">
      {text}
    </div>
  );
}
