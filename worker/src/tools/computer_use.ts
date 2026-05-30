// computer_use — drive the user's ACTUAL computer (mouse + keyboard, any app)
// for a native/desktop sub-task the browser can't reach. This is the unified
// harness tap: the cloud agent stays the decider (it owns the run, context,
// approvals, outputs) and delegates execution to the user's machine, which runs
// the local eyes->brain->hands loop and returns a result. The agent picks this
// only AFTER Composio APIs + the browser — see the tool ladder in the prompt.
//
// Mechanism: enqueue a request row; the user's desktop (online during a local
// run) claims it, runs the loop, and writes the result back. We poll until done.

import { defineTool } from "@basics/shared";
import { z } from "zod";
import type { WorkerToolContext } from "./context.js";

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 5 * 60 * 1000;

export const computer_use = defineTool({
  name: "computer_use",
  description:
    "Drive the user's real computer (mouse + keyboard, ANY app) to do a NATIVE / desktop sub-task the browser can't reach — a desktop application, an OS dialog, or a non-browser UI. Use ONLY when the target is not a website: prefer Composio APIs first, then the browser tools, and reach for this last. Hand it a clear, self-contained `task`; the user's machine runs it locally and returns the outcome. Works only on LOCAL runs while the user's desktop is online. Returns { ok, result } or { ok:false, error }.",
  params: z.object({ task: z.string().min(3).max(2000) }),
  mutating: true,
  requiresApproval: false, // the local loop is bounded + the user can Stop it
  cost: "high",
  execute: async ({ task }, ctx: WorkerToolContext) => {
    const sql = ctx.sql;
    if (!sql) {
      return { kind: "json" as const, json: { ok: false, error: { code: "unavailable", message: "ctx.sql not configured" } } };
    }

    const inserted = (
      await sql<Array<{ id: string }>>`
        INSERT INTO public.computer_use_requests (workspace_id, run_id, task, status)
        VALUES (${ctx.workspaceId}::uuid, ${ctx.runId ?? null}::uuid, ${task}, 'pending')
        RETURNING id::text AS id
      `
    )[0];
    const id = inserted?.id;
    if (!id) {
      return { kind: "json" as const, json: { ok: false, error: { code: "enqueue_failed", message: "could not enqueue the task" } } };
    }

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const st = (
        await sql<Array<{ status: string; result: unknown }>>`
          SELECT status, result FROM public.computer_use_requests WHERE id = ${id}::uuid LIMIT 1
        `
      )[0];
      if (!st) break;
      if (st.status === "done") {
        const r = (st.result as { text?: string; steps?: number } | null) ?? {};
        return { kind: "text" as const, text: `Computer-use completed${r.steps ? ` in ${r.steps} steps` : ""}: ${r.text ?? "done"}` };
      }
      if (st.status === "error") {
        const r = (st.result as { error?: string } | null) ?? {};
        return { kind: "json" as const, json: { ok: false, error: { code: "computer_use_failed", message: r.error ?? "computer-use failed" } } };
      }
    }

    await sql`
      UPDATE public.computer_use_requests
         SET status = 'error', result = ${JSON.stringify({ error: "timed out waiting for the desktop" })}::jsonb, updated_at = now()
       WHERE id = ${id}::uuid AND status IN ('pending', 'running')
    `;
    return {
      kind: "json" as const,
      json: { ok: false, error: { code: "timeout", message: "Timed out — this needs a LOCAL run with the user's desktop online." } },
    };
  },
});
