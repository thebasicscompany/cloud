"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Plus, Search, Sparkles } from "@/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgents } from "@/hooks/queries/use-agents";
import type { Agent } from "@/types/agent";

const TARGET_LABEL: Record<string, string> = {
  cloud: "Cloud",
  computer: "Computer use",
  chrome: "Your Chrome",
};

export function AgentsLibrary() {
  const { data: agents = [], isLoading } = useAgents();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q));
  }, [agents, query]);

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">Agents</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents"
              className="h-9 w-56 pl-8"
            />
          </div>
          <Button asChild size="sm">
            <Link href="/agents/new">
              <Plus className="size-4" /> Create
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasQuery={Boolean(query)} />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-accent/40"
    >
      <Avatar agent={agent} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{agent.name}</div>
        <div className="truncate text-muted-foreground text-xs">{TARGET_LABEL[agent.target] ?? agent.target}</div>
      </div>
    </Link>
  );
}

function Avatar({ agent }: { agent: Agent }) {
  // Color seeded by name for deterministic-but-varied tile color.
  const hue = useMemo(() => {
    let h = 0;
    for (const ch of agent.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }, [agent.name]);
  const initials = agent.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (agent.avatar && agent.avatar.length <= 4) {
    return (
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-lg"
        style={{ background: `oklch(0.92 0.06 ${hue})` }}
      >
        {agent.avatar}
      </div>
    );
  }
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-md font-medium text-sm text-foreground/80"
      style={{ background: `oklch(0.92 0.06 ${hue})` }}
    >
      {initials || <Sparkles className="size-4" />}
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  if (hasQuery) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-10 text-center text-muted-foreground text-sm">
        No agents match that.
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 p-12 text-center">
      <Sparkles className="mb-3 size-8 text-muted-foreground" />
      <h2 className="font-medium text-base">No agents yet</h2>
      <p className="mt-1 max-w-sm text-muted-foreground text-sm">
        Agents are reusable workers you create once and run on demand or on a schedule.
      </p>
      <Button asChild className="mt-4" size="sm">
        <Link href="/agents/new">
          <Plus className="size-4" /> Create your first agent
        </Link>
      </Button>
    </div>
  );
}
