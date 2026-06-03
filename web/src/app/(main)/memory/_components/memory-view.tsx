"use client";

import { useState } from "react";

import { Brain, Lightning } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AgentHelper, AgentSkill } from "@/lib/agent-data";

import { Search } from "@/icons";

/**
 * Memory view — what the workspace's agents have learned over time. Two
 * lists: skills (durable instructions saved from good runs) and helpers
 * (reusable callable shortcuts). Each row is read-only here; deletion is
 * intentionally out of scope for v1 — skills/helpers come from real runs
 * and removing them silently breaks future replays.
 */
export function MemoryView({
  skills,
  helpers,
}: {
  skills: AgentSkill[];
  helpers: AgentHelper[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filteredSkills = q
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q) ||
          (s.host ?? "").toLowerCase().includes(q),
      )
    : skills;
  const filteredHelpers = q
    ? helpers.filter(
        (h) => h.name.toLowerCase().includes(q) || (h.description ?? "").toLowerCase().includes(q),
      )
    : helpers;
  const activeSkills = filteredSkills.filter((s) => s.active);
  const pendingSkills = filteredSkills.filter((s) => s.pendingReview);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Memory</h1>
          <p className="mt-1 text-foreground/60 text-sm">
            What your agents have learned. Skills are durable plays; helpers are reusable shortcuts.
          </p>
        </div>
        <div className="relative">
          <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-foreground/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memory"
            className="h-9 w-56 pl-8"
          />
        </div>
      </header>

      {/* Skills */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Brain weight="fill" className="size-4 text-foreground/70" />
          <h2 className="font-medium text-sm">Skills</h2>
          <Badge variant="outline" className="h-5">{activeSkills.length}</Badge>
          {pendingSkills.length > 0 ? (
            <Badge variant="secondary" className="h-5">{pendingSkills.length} pending review</Badge>
          ) : null}
        </div>
        {filteredSkills.length === 0 ? (
          <EmptyCard
            hasQuery={Boolean(q)}
            label="skills"
            blurb="Agents save skills automatically when a run succeeds in a new way. They'll show up here."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredSkills.map((s) => (
              <Card key={s.id} size="sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    {s.pendingReview ? (
                      <Badge variant="secondary">Pending</Badge>
                    ) : s.active ? (
                      <Badge>Active</Badge>
                    ) : (
                      <Badge variant="outline">Off</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {s.description ? <p className="text-foreground/80 text-sm">{s.description}</p> : null}
                  <p className="text-foreground/50 text-xs">
                    {s.host ? `${s.host} · ` : ""}
                    {s.scope ?? "workspace"}
                    {s.confidence != null ? ` · confidence ${Math.round(s.confidence * 100)}%` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Helpers */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Lightning weight="fill" className="size-4 text-foreground/70" />
          <h2 className="font-medium text-sm">Helpers</h2>
          <Badge variant="outline" className="h-5">{filteredHelpers.length}</Badge>
        </div>
        {filteredHelpers.length === 0 ? (
          <EmptyCard
            hasQuery={Boolean(q)}
            label="helpers"
            blurb="Helpers are agent-authored shortcuts (small reusable pipelines). They appear here when an agent writes one."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredHelpers.map((h) => (
              <Card key={h.id} size="sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{h.name}</CardTitle>
                    {h.active ? <Badge>Active</Badge> : <Badge variant="outline">Off</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {h.description ? <p className="text-foreground/80 text-sm">{h.description}</p> : null}
                  <p className="text-foreground/50 text-xs">
                    v{h.version ?? 1}
                    {h.createdAt ? ` · added ${new Date(h.createdAt).toLocaleDateString()}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyCard({ hasQuery, label, blurb }: { hasQuery: boolean; label: string; blurb: string }) {
  return (
    <Card className="border-dashed bg-foreground/[0.02] py-8 text-center">
      <CardContent>
        <p className="text-foreground/60 text-sm">{hasQuery ? `No ${label} match that.` : blurb}</p>
      </CardContent>
    </Card>
  );
}
