"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { Brain, Wrench, X } from "@/icons";

import { Button } from "@/components/ui/button";

/**
 * "Suggested automations" — the proactive surface for pattern recognition.
 * Shows automation candidates the system noticed: recurring tasks from run
 * history ('runs') and, once lens is capturing, distilled on-device patterns
 * ('lens'). Build hands the prompt straight to the agent box; Dismiss hides it
 * for good. Renders nothing when there are no suggestions, so it never nags.
 */
interface Suggestion {
  id: string;
  source: "runs" | "lens" | "manual";
  title: string;
  rationale: string;
  suggestedPrompt: string;
  confidence: number | null;
}

export function SuggestionsCard() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const { data, refetch } = useQuery({
    queryKey: ["suggestions"],
    queryFn: async (): Promise<Suggestion[]> => {
      try {
        const res = await fetch("/api/suggestions");
        if (res.ok) return ((await res.json()).suggestions ?? []) as Suggestion[];
      } catch {
        /* offline — empty */
      }
      return [];
    },
    staleTime: 60_000,
  });

  const suggestions = (data ?? []).filter((s) => !hidden.has(s.id));
  if (suggestions.length === 0) return null;

  const act = (id: string, status: "accepted" | "dismissed") => {
    setHidden((prev) => new Set(prev).add(id));
    void fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    })
      .catch(() => undefined)
      .finally(() => void refetch());
  };

  const build = (s: Suggestion) => {
    // Hand the prompt to the agent box (same-window event) + a cross-window
    // fallback so it lands wherever the workbench is mounted.
    try {
      window.dispatchEvent(new CustomEvent("basichome:use-prompt", { detail: s.suggestedPrompt }));
      window.localStorage.setItem("basichome:routine-prompt", s.suggestedPrompt);
    } catch {
      /* ignore */
    }
    act(s.id, "accepted");
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-base tracking-tight">
          <Brain className="size-4 text-primary" />
          Suggested automations
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {suggestions.map((s) => (
          <div
            key={s.id}
            className="group relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30"
          >
            <button
              type="button"
              onClick={() => act(s.id, "dismissed")}
              aria-label="Dismiss suggestion"
              className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
            >
              <X className="size-4" />
            </button>
            <div className="min-w-0 pr-6">
              <div className="font-medium text-sm leading-snug">{s.title}</div>
              <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{s.rationale}</p>
            </div>
            <div className="mt-auto flex items-center gap-2">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => build(s)}>
                <Wrench className="size-3.5" />
                Build it
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {s.source === "lens" ? "Noticed on your screen" : "From your run history"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
