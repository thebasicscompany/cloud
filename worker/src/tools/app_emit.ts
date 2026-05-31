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
    "Append a record (an output) to a workspace App — a typed surface (table/board/list) where outputs accumulate and the user can read/edit them. Use this to durably persist a structured result (a lead, a digest entry, a row) instead of only returning text. `appSlug` selects the app; if it doesn't exist and `appName` is given, it is created. `data` is the record object. For board apps set `status` to the column. Pass a stable `dedupKey` to avoid duplicates on re-runs. To create an app that has NO rows yet (e.g. a sync that found nothing this run), call with appName + appKind + `fields` (the columns) and OMIT `data` — the app is created empty and ready to populate later.",
  params: z.object({
    appSlug: z
      .string()
      .min(1)
      .max(48)
      .regex(/^[a-z0-9-]+$/, "appSlug must be kebab-case"),
    data: z.record(z.string(), z.unknown()).optional(),
    status: z.string().max(80).optional(),
    dedupKey: z.string().max(200).optional(),
    // Create-if-missing metadata.
    appName: z.string().max(80).optional(),
    appKind: z.enum(["table", "board", "list"]).optional(),
    appIcon: z.string().max(8).optional(),
    appDescription: z.string().max(500).optional(),
    // Explicit column schema. Use when creating an app with no rows yet so it
    // still has its proper columns; if omitted, columns derive from `data`.
    fields: z
      .array(
        z.object({
          key: z.string().min(1).max(80),
          label: z.string().max(120).optional(),
          type: z.string().max(40).optional(),
        }),
      )
      .max(50)
      .optional(),
  }),
  mutating: true,
  // Creating an app is benign — it's just a data surface the user can rename or
  // delete — and blocking an autonomous cloud run on it for approval defeats the
  // low-human-in-the-loop goal (especially now that the agent is asked to create
  // the output app up front, even empty). So app_emit never requires approval.
  approval: () => ({ required: false }),
  cost: "low",
  execute: async (
    { appSlug, data, status, dedupKey, appName, appKind, appIcon, appDescription, fields },
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
    const appExisted = Boolean(app);

    if (!app) {
      if (!appName) {
        return {
          kind: "json" as const,
          json: {
            ok: false,
            error: {
              code: "app_not_found",
              message: `No app "${slug}" in this workspace. Pass appName (and optionally appKind/fields) to create it.`,
            },
          },
        };
      }
      // Column schema: explicit `fields` wins; else derive from `data` keys;
      // else empty (an app created with no rows yet — still has its columns).
      const schemaCols =
        fields && fields.length > 0
          ? fields.map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type ?? "text" }))
          : data
            ? Object.keys(data).map((k) => ({ key: k, label: k, type: "text" }))
            : [];
      const k0 = schemaCols[0]?.key;
      const k1 = schemaCols[1]?.key;
      const created = await sql<Array<{ id: string }>>`
        INSERT INTO public.workspace_apps
          (workspace_id, slug, name, description, icon, kind, fields, view, source_run_id)
        VALUES
          (${ctx.workspaceId}::uuid, ${slug}, ${appName}, ${appDescription ?? ""},
           ${appIcon ?? null}, ${appKind ?? "table"},
           ${sql.json(schemaCols as unknown as Parameters<typeof sql.json>[0])},
           ${sql.json((appKind === "board"
             ? { groupBy: "status", titleField: k0, stages: ["New", "In progress", "Done"] }
             : appKind === "list"
               ? { titleField: k0, bodyField: k1 }
               : {}) as unknown as Parameters<typeof sql.json>[0])},
           ${ctx.runId ?? null}::uuid)
        ON CONFLICT (workspace_id, slug) DO UPDATE SET updated_at = now()
        RETURNING id::text AS id
      `;
      app = created[0]!;
    }

    // No data → an app-create-only call (e.g. a sync that found nothing this
    // run). The app now exists and is ready to populate; don't insert a record.
    if (!data || Object.keys(data).length === 0) {
      await sql`UPDATE public.workspace_apps SET updated_at = now() WHERE id = ${app.id}::uuid`;
      await ctx.publish({
        type: "app_created",
        payload: { kind: "app_created", appSlug: slug, empty: true },
      });
      return { kind: "json" as const, json: { ok: true, appSlug: slug, created: !appExisted, empty: true } };
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
