"use client";

import { useState } from "react";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { CheckCircle2, ChevronRight } from "@/icons";

import { Button } from "@/components/ui/button";
import { MarkdownLite } from "@/components/markdown-lite";
import { resolveAppIcon } from "@/lib/app-icons";
import type { DocSummary } from "@/lib/documents-data";
import type { Run } from "@/types/runs";

/**
 * Surfaces what a run produced. If the agent saved it (doc_write), we link the
 * document. If the agent only returned text (it lands as the run's result and is
 * otherwise stranded on this page), we show it with a one-click "Save to
 * Documents" so the output actually goes somewhere the user can find later.
 */
export function RunOutputs({ run }: { run: Run }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["run-outputs", run.id],
    queryFn: async (): Promise<DocSummary[]> => {
      const res = await fetch(`/api/runs/${run.id}/outputs`);
      if (!res.ok) return [];
      return ((await res.json()).documents ?? []) as DocSummary[];
    },
    refetchInterval: 8000,
  });

  const outputs = data ?? [];
  const summary = run.resultSummary?.trim();
  if (outputs.length === 0 && !summary) return null;

  const saveToDocuments = async () => {
    if (!summary) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const title =
        run.workflowName && run.workflowName !== "ad-hoc"
          ? run.workflowName
          : `Result - ${run.id.slice(0, 8)}`;
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          summary: summary.slice(0, 200),
          body: summary,
          sourceRunId: run.id,
          icon: "document",
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.slug) throw new Error(body.error || "Could not save to Documents.");
      qc.invalidateQueries({ queryKey: ["run-outputs", run.id] });
      qc.invalidateQueries({ queryKey: ["documents-list"] });
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="font-semibold text-base">Output</h2>
      {outputs.length > 0 ? (
        <div className="mt-3 space-y-2">
          {outputs.map((doc) => {
            const Icon = resolveAppIcon({ icon: doc.icon, name: doc.title });
            return (
              <Link
                key={doc.id}
                href="/documents"
                prefetch={false}
                className="group flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-foreground/30"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" weight="duotone" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-sm">{doc.title}</div>
                  {doc.summary ? (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">{doc.summary}</p>
                  ) : null}
                  <div className="mt-1 text-muted-foreground text-[11px]">Saved in Documents</div>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground text-xs">
            This run returned a result but didn&apos;t save it anywhere you&apos;d find later. Save it to
            Documents to keep it.
          </p>
          <div className="max-h-[32rem] overflow-auto rounded-lg border bg-muted/20 p-4">
            <MarkdownLite text={summary ?? ""} />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void saveToDocuments()} disabled={saving}>
              <CheckCircle2 className="size-4" />
              {saving ? "Saving…" : "Save to Documents"}
            </Button>
            {saveErr ? <span className="text-destructive text-xs">{saveErr}</span> : null}
          </div>
        </div>
      )}
    </section>
  );
}
