/**
 * Usage meter for API-side model calls (computer-use /step, /reason, /ground,
 * lens-distill). These call Claude directly and were previously UNMETERED — a
 * cost blind spot. This records each call's tokens + cost into the same
 * `public.usage_tracking` daily ledger the worker's cost-tracker + budget-gate
 * use, so computer-use spend is visible AND counts toward the workspace's daily
 * budget ceiling.
 *
 * Fire-and-forget: metering must NEVER block or fail the request.
 */
import { sql } from 'drizzle-orm'
import { getDb } from '../db/index.js'
import { logger } from '../middleware/logger.js'

// Per-1M-token USD rates — mirror worker/pricing.json; keep in sync.
const RATES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
}

// Anthropic prompt-cache multipliers on the input rate.
const CACHE_WRITE_MULT = 1.25
const CACHE_READ_MULT = 0.1

export interface UsageInput {
  workspaceId: string
  accountId: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
}

/** Record one model call into the daily usage ledger. Never throws. */
export function recordUsage(u: UsageInput): void {
  const rate = RATES[u.model]
  const totalIn = u.inputTokens + (u.cacheCreationTokens ?? 0) + (u.cacheReadTokens ?? 0)
  if (!rate || (totalIn === 0 && u.outputTokens === 0)) return

  const inputDollars =
    (u.inputTokens * rate.input +
      (u.cacheCreationTokens ?? 0) * rate.input * CACHE_WRITE_MULT +
      (u.cacheReadTokens ?? 0) * rate.input * CACHE_READ_MULT) /
    1_000_000
  const outputDollars = (u.outputTokens * rate.output) / 1_000_000
  const cents = Math.round((inputDollars + outputDollars) * 100)

  void getDb()
    .execute(
      sql`
        INSERT INTO public.usage_tracking
          (workspace_id, account_id, date, tokens_input, tokens_output, llm_calls, cost_cents)
        VALUES
          (${u.workspaceId}, ${u.accountId}, CURRENT_DATE, ${totalIn}, ${u.outputTokens}, 1, ${cents})
        ON CONFLICT (workspace_id, account_id, date) DO UPDATE
           SET tokens_input  = public.usage_tracking.tokens_input  + EXCLUDED.tokens_input,
               tokens_output = public.usage_tracking.tokens_output + EXCLUDED.tokens_output,
               llm_calls     = public.usage_tracking.llm_calls     + EXCLUDED.llm_calls,
               cost_cents    = public.usage_tracking.cost_cents    + EXCLUDED.cost_cents
      `,
    )
    .catch((err) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'usage-meter: record failed (non-fatal)')
    })
}
