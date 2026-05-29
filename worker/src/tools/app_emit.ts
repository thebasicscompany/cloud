// app_emit — write a record (output) into a workspace App. Apps are typed
// data surfaces (table | board | list) where run/automation outputs
// accumulate and that the user and agents both read/write. This is how an
// agent drops a result somewhere durable and structured — e.g. a GTM run
// appends a lead to the "gtm-crm" app.
//
// If the app doesn't exist yet and `appName` is provided, it is created on
// first emit (so an agent can spin up a fresh surface for a new kind of
// output). Records carry provenance (source_run_id / source_automation_id)
// so the UI can show where each row came from. `dedupKey` makes the write
// idempotent within an app.

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

export const app_emit = defineTool({
  name: "app_emit",
  description:
    "Append a record (an output) to a workspace App — a typed surface (table/board/list) where outputs accumulate and the user can read/edit them. Use this to durably persist a structured result (a lead, a digest entry, a row) instead of only returning text. `appSlug` selects the app; if it doesn't exist and `appName` is given, it is created. `data` is the record object. For board apps set `status` to the column. Pass a stable `dedupKey` to avoid duplicates on re-runs.",
  params: z.object({
    appSlug: z
      .string()
      .min(1)
      .max(48)
      .regex(/^[a-z0-9-]+$/, "appSlug must be kebab-case"),
    data: z.record(z.string(), z.unknown()),
    status: z.string().max(80).optional(),
    dedupKey: z.string().max(200).optional(),
    // Create-if-missing metadata.
    appName: z.string().max(80).optional(),
    appKind: z.enum(["table", "board", "list"]).optional(),
    appIcon: z.string().max(8).optional(),
    appDescription: z.string().max(500).optional(),
  }),
  mutating: true,
  // "Ask the user before MAKING a new app." Creating a new surface (signalled
  // by passing appName for a slug that may not exist) pauses for approval;
  // appending to an existing app flows freely. The user can "remember this"
  // to skip future prompts (approval_rules).
  approval: (args) =>
    args.appName
      ? {
          required: true,
          reason: `Create a new app "${args.appName}" (slug: ${args.appSlug})`,
          expiresInSeconds: 4 * 60 * 60,
        }
      : { required: false },
  cost: "low",
  execute: async (
    { appSlug, data, status, dedupKey, appName, appKind, appIcon, appDescription },
    ctx: WorkerToolContext,
  ) => {
    const sql = ctx.sql;
    if (!sql) {
      return { kind: "json" as const, json: { ok: false, error: { code: "unavailable", message: "ctx.sql not configured" } } };
    }
    const slug = slugify(appSlug);
    if (!slug) {
      return { kind: "json" as const, json: { ok: false, error: { code: "bad_slug", message: "appSlug resolved to empty" } } };
    }

    // Resolve the app (workspace-scoped), or create it if metadata is given.
    let app = (
      await sql<Array<{ id: string }>>`
        SELECT id::text AS id FROM public.workspace_apps
         WHERE workspace_id = ${ctx.workspaceId}::uuid AND slug = ${slug}
         LIMIT 1
      `
    )[0];

    if (!app) {
      if (!appName) {
        return {
          kind: "json" as const,
          json: {
            ok: false,
            error: {
              code: "app_not_found",
              message: `No app "${slug}" in this workspace. Pass appName (and optionally appKind/appIcon) to create it on first emit.`,
            },
          },
        };
      }
      const created = await sql<Array<{ id: string }>>`
        INSERT INTO public.workspace_apps
          (workspace_id, slug, name, description, icon, kind, fields, view, source_run_id)
        VALUES
          (${ctx.workspaceId}::uuid, ${slug}, ${appName}, ${appDescription ?? ""},
           ${appIcon ?? null}, ${appKind ?? "table"},
           ${sql.json(Object.keys(data).map((k) => ({ key: k, label: k, type: "text" })) as unknown as Parameters<typeof sql.json>[0])},
           ${sql.json((appKind === "board"
             ? { groupBy: "status", titleField: Object.keys(data)[0], stages: ["New", "In progress", "Done"] }
             : appKind === "list"
               ? { titleField: Object.keys(data)[0], bodyField: Object.keys(data)[1] }
               : {}) as unknown as Parameters<typeof sql.json>[0])},
           ${ctx.runId ?? null}::uuid)
        ON CONFLICT (workspace_id, slug) DO UPDATE SET updated_at = now()
        RETURNING id::text AS id
      `;
      app = created[0]!;
    }

    const automationId = (ctx as { automationId?: string }).automationId ?? null;
    const dataJson = sql.json(data as unknown as Parameters<typeof sql.json>[0]);

    const inserted = await sql<Array<{ id: string }>>`
      INSERT INTO public.workspace_app_records
        (app_id, workspace_id, data, status, dedup_key, source_run_id, source_automation_id)
      VALUES
        (${app.id}::uuid, ${ctx.workspaceId}::uuid, ${dataJson},
         ${status ?? null}, ${dedupKey ?? null},
         ${ctx.runId ?? null}::uuid, ${automationId}::uuid)
      ON CONFLICT (app_id, dedup_key) DO UPDATE
        SET data = EXCLUDED.data, status = EXCLUDED.status, updated_at = now()
      RETURNING id::text AS id
    `;

    await sql`UPDATE public.workspace_apps SET updated_at = now() WHERE id = ${app.id}::uuid`;

    await ctx.publish({
      type: "app_record_written",
      payload: { kind: "app_record_written", appSlug: slug, recordId: inserted[0]?.id, status: status ?? null },
    });

    return { kind: "json" as const, json: { ok: true, appSlug: slug, recordId: inserted[0]?.id } };
  },
});
