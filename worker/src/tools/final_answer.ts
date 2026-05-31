import { defineTool } from "@basics/shared";
import { z } from "zod";
import type { WorkerToolContext } from "./context.js";

export const final_answer = defineTool({
  name: "final_answer",
  description:
    "Emit the run's final answer / summary. The runner converts this into the run_completed event's `summary` field; calling it signals the model is done.",
  params: z.object({
    text: z.string().min(1).max(20_000),
  }),
  mutating: false,
  cost: "low",
  execute: async ({ text }, ctx: WorkerToolContext) => {
    await ctx.publish({
      type: "final_answer",
      payload: { text },
    });
    // Authoritative run summary — write the agent's ACTUAL answer straight to
    // the run row, so result_summary is the answer (not whatever stray
    // reasoning text happened to be the last assistant message). The worker's
    // terminal handler COALESCEs result_summary and won't overwrite this.
    if (ctx.sql && ctx.runId) {
      await ctx.sql`
        UPDATE public.cloud_runs
           SET result_summary = ${text.slice(0, 4000)}
         WHERE id = ${ctx.runId}
      `.catch(() => undefined);
    }
    return { kind: "text", text: "ok" };
  },
});
