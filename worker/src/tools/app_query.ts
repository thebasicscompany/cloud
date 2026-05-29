// app_query — read records from a workspace App. The read side of the App
// surface: an agent (or a later run) can pull the rows the user and prior
// runs put there — e.g. read the "gtm-crm" leads to email them, or read the
// latest "inbox-digest" entries. Workspace-scoped; never crosses tenants.

import { defineTool } from "@basics/shared";
import { z } from "zod";
import type { WorkerToolContext } from "./context.js";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const app_query = defineTool({
  name: "app_query",
  description:
    "Read records from a workspace App (a typed surface like a CRM or digest). Returns the most recent records (optionally filtered by board `status`). Use this to act on data the user or earlier runs accumulated — e.g. read leads from the CRM app before reaching out. Returns { ok, app: {name,kind,fields}, records: [{id,data,status,source}] }.",
  params: z.object({
    appSlug: z
      .string()
      .min(1)
      .max(48)
      .regex(/^[a-z0-9-]+$/, "appSlug must be kebab-case"),
    status: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  mutating: false,
  requiresApproval: false,
  cost: "low",
  execute: async ({ appSlug, status, limit }, ctx: WorkerToolContext) => {
    const sql = ctx.sql;
    if (!sql) {
      return { kind: "json" as const, json: { ok: false, error: { code: "unavailable", message: "ctx.sql not configured" } } };
    }
    const slug = slugify(appSlug);
    const app = (
      await sql<Array<{ id: string; name: string; kind: string; fields: unknown }>>`
        SELECT id::text AS id, name, kind, fields FROM public.workspace_apps
         WHERE workspace_id = ${ctx.workspaceId}::uuid AND slug = ${slug}
         LIMIT 1
      `
    )[0];
    if (!app) {
      return { kind: "json" as const, json: { ok: false, error: { code: "app_not_found", message: `No app "${slug}" in this workspace.` } } };
    }

    const max = limit ?? 100;
    const rows = status
      ? await sql<Array<Record<string, unknown>>>`
          SELECT id::text AS id, data, status,
                 source_run_id::text AS source_run_id, source_automation_id::text AS source_automation_id,
                 created_at::text AS created_at
            FROM public.workspace_app_records
           WHERE app_id = ${app.id}::uuid AND workspace_id = ${ctx.workspaceId}::uuid AND status = ${status}
           ORDER BY created_at DESC LIMIT ${max}
        `
      : await sql<Array<Record<string, unknown>>>`
          SELECT id::text AS id, data, status,
                 source_run_id::text AS source_run_id, source_automation_id::text AS source_automation_id,
                 created_at::text AS created_at
            FROM public.workspace_app_records
           WHERE app_id = ${app.id}::uuid AND workspace_id = ${ctx.workspaceId}::uuid
           ORDER BY created_at DESC LIMIT ${max}
        `;

    const records = rows.map((r) => ({
      id: r.id as string,
      data: r.data as Record<string, unknown>,
      status: (r.status as string) ?? null,
      source: r.source_automation_id
        ? { kind: "automation", id: r.source_automation_id as string }
        : r.source_run_id
          ? { kind: "run", id: r.source_run_id as string }
          : { kind: "user", id: null },
      createdAt: r.created_at as string,
    }));

    return {
      kind: "json" as const,
      json: { ok: true, app: { name: app.name, kind: app.kind, fields: app.fields }, count: records.length, records },
    };
  },
});
