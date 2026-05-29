// doc_write — create or update a Document: a long-form artifact (report,
// plan, draft) that the user reviews in the Documents surface. This is how
// an automation turns a run into something durable and readable — e.g. a
// "Weekly GTM Report" or an outreach draft. Distinct from app_emit (which
// appends a structured record to an App). Markdown body. Idempotent within a
// workspace when `dedupKey` is supplied (re-runs update the same doc).

import { defineTool } from "@basics/shared";
import { z } from "zod";
import type { WorkerToolContext } from "./context.js";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const doc_write = defineTool({
  name: "doc_write",
  description:
    "Create or update a Document — a long-form, readable artifact (report, plan, brief, draft) the user reviews in the Documents area. Use this for narrative outputs (e.g. a weekly summary, a research write-up, a drafted email) as opposed to app_emit, which appends a structured row to an App. `body` is markdown. Pass a stable `dedupKey` so a recurring automation updates the same document instead of creating duplicates.",
  params: z.object({
    title: z.string().min(1).max(160),
    body: z.string().max(200_000).default(""),
    summary: z.string().max(400).optional(),
    slug: z.string().max(60).regex(/^[a-z0-9-]+$/).optional(),
    icon: z.string().max(24).optional(),
    status: z.enum(["draft", "ready"]).optional(),
    dedupKey: z.string().max(200).optional(),
  }),
  mutating: true,
  requiresApproval: false,
  cost: "low",
  execute: async ({ title, body, summary, slug, icon, status, dedupKey }, ctx: WorkerToolContext) => {
    const sql = ctx.sql;
    if (!sql) {
      return { kind: "json" as const, json: { ok: false, error: { code: "unavailable", message: "ctx.sql not configured" } } };
    }
    const finalSlug = slug || slugify(title) || `doc-${Date.now()}`;
    const automationId = (ctx as { automationId?: string }).automationId ?? null;

    const rows = await sql<Array<{ id: string; slug: string }>>`
      INSERT INTO public.workspace_documents
        (workspace_id, slug, title, summary, icon, body, status, dedup_key, source_run_id, source_automation_id)
      VALUES
        (${ctx.workspaceId}::uuid, ${finalSlug}, ${title}, ${summary ?? ""},
         ${icon ?? "document"}, ${body}, ${status ?? "ready"}, ${dedupKey ?? null},
         ${ctx.runId ?? null}::uuid, ${automationId}::uuid)
      ON CONFLICT (workspace_id, dedup_key) DO UPDATE
        SET title = EXCLUDED.title, summary = EXCLUDED.summary, body = EXCLUDED.body,
            icon = EXCLUDED.icon, status = EXCLUDED.status, updated_at = now()
      RETURNING id::text AS id, slug
    `;
    const doc = rows[0];

    await ctx.publish({
      type: "document_written",
      payload: { kind: "document_written", slug: doc?.slug ?? finalSlug, documentId: doc?.id, title },
    });

    return { kind: "json" as const, json: { ok: true, slug: doc?.slug ?? finalSlug, documentId: doc?.id } };
  },
});
