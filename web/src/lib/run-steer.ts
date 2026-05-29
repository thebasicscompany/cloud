import "server-only";

import postgres from "postgres";

/**
 * Steer / message a LIVE cloud run by delivering a follow-up user message to
 * the opencode session that is currently executing it.
 *
 * Mechanism: the worker that owns the run's pool is LISTENing on a per-pool
 * Postgres channel (`pool_<poolId underscored>`). It re-prompts the live
 * opencode session when it receives a NOTIFY whose body is
 * `{kind:'continue', runId, message}` (see worker/src/main.ts continue branch).
 *
 * LISTEN/NOTIFY only works over a Postgres SESSION-mode connection (the direct
 * db.<ref>.supabase.co:5432 host — NOT the :6543 transaction pooler), so this
 * uses DATABASE_URL_SESSION rather than the app's normal pooled connection.
 */

const SESSION_URL = process.env.DATABASE_URL_SESSION;

/** Mirror of worker/src/main.ts poolChannel(): channel names can't have hyphens. */
function poolChannel(poolId: string): string {
  return `pool_${poolId.replace(/-/g, "_")}`;
}

export type SteerResult =
  | { ok: true }
  | { ok: false; reason: "not_live" | "not_configured" | "error"; error?: string };

export async function steerRun(runId: string, message: string): Promise<SteerResult> {
  if (!SESSION_URL) {
    return { ok: false, reason: "not_configured", error: "DATABASE_URL_SESSION not set." };
  }
  const trimmed = message?.trim();
  if (!trimmed) {
    return { ok: false, reason: "error", error: "A message is required." };
  }

  let sql: ReturnType<typeof postgres> | null = null;
  try {
    // Session mode is required for pg_notify to reach the worker's LISTEN.
    sql = postgres(SESSION_URL, { prepare: false, max: 1, idle_timeout: 5 });

    // Find the run's currently-live pool: the latest open binding for this run.
    const rows = await sql<Array<{ pool_id: string | null }>>`
      SELECT pool_id::text AS pool_id
        FROM public.cloud_session_bindings
       WHERE run_id = ${runId}::uuid
         AND ended_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
    `;

    const poolId = rows[0]?.pool_id;
    if (!poolId) {
      return { ok: false, reason: "not_live" };
    }

    const channel = poolChannel(poolId);
    const body = JSON.stringify({ kind: "continue", runId, message: trimmed });
    await sql`SELECT pg_notify(${channel}, ${body})`;

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error", error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (sql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
