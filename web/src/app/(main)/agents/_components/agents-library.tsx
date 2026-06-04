"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Robot } from "@phosphor-icons/react";

import { Plus, Search } from "@/icons";

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
  const { data: agents = [], isLoading, error } = useAgents();
  const [query, setQuery] = useState("");
  const fetchStatus = (error as Error & { status?: number } | undefined)?.status;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q),
    );
  }, [agents, query]);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl tracking-tight">Agents</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-foreground/40" />
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

      {/* Negative margin + matching padding gives hover lifts/shadows room
          to render before the scroll viewport's clipping edge. */}
      <div className="-m-2 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-foreground/5" />
            ))}
          </div>
        ) : error ? (
          <ErrorState status={fetchStatus} message={(error as Error).message} />
        ) : filtered.length === 0 ? (
          <EmptyState hasQuery={Boolean(query)} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
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
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group flex flex-col items-start gap-3 rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md"
    >
      <div
        className="flex size-11 items-center justify-center rounded-xl text-lg"
        style={{ background: `oklch(0.94 0.06 ${hue})` }}
      >
        {agent.avatar && agent.avatar.length <= 4 ? (
          <span>{agent.avatar}</span>
        ) : initials ? (
          <span className="font-medium text-foreground/80 text-sm">{initials}</span>
        ) : (
          <Robot weight="fill" className="size-5" />
        )}
      </div>
      <div className="min-w-0 w-full">
        <div className="truncate font-medium text-sm">{agent.name}</div>
        <div className="mt-0.5 truncate text-foreground/60 text-xs">
          {TARGET_LABEL[agent.target] ?? agent.target}
          {agent.schedule?.enabled ? " · scheduled" : ""}
        </div>
      </div>
    </Link>
  );
}

function ErrorState({ status, message }: { status?: number; message: string }) {
  // 401 / 403 = session expired or wrong workspace. Anything else = transient.
  const isAuth = status === 401 || status === 403;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 p-12 text-center">
      <Robot weight="fill" className="mb-3 size-8 text-destructive/60" />
      <h2 className="font-medium text-base text-destructive">
        {isAuth ? "Session expired" : "Couldn't load your agents"}
      </h2>
      <p className="mt-1 max-w-md text-foreground/60 text-sm">
        {isAuth
          ? "Sign back in to reload your agents - your workspace JWT expired."
          : "Something went wrong reaching the agents API. Try refreshing; if it keeps failing, check Status."}
      </p>
      <p className="mt-2 max-w-md text-foreground/40 text-xs">
        {status ? `status ${status} · ` : ""}{message}
      </p>
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  if (hasQuery) {
    return (
      <div className="rounded-2xl border border-dashed bg-foreground/[0.02] p-10 text-center text-foreground/60 text-sm">
        No agents match that.
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-foreground/[0.02] p-12 text-center">
      <Robot weight="fill" className="mb-3 size-8 text-foreground/40" />
      <h2 className="font-medium text-base">No agents yet</h2>
      <p className="mt-1 max-w-sm text-foreground/60 text-sm">
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
