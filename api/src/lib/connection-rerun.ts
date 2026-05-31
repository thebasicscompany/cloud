import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

import { db } from '../db/index.js'
import { getConfig } from '../config.js'
import { wrapAutomationGoal } from './cloud-run-dispatch.js'
import { logger } from '../middleware/logger.js'

let _sqs: SQSClient | null = null
function sqsClient(): SQSClient {
  if (!_sqs) _sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
  return _sqs
}

/**
 * Auto-re-run on connect (browser logins).
 *
 * After a cloud browser login is SAVED for `host`, find a recently-finished
 * automation run in the workspace that was blocked waiting on that login and
 * whose browser-login needs are now ALL satisfied, and re-dispatch the
 * automation so it continues hands-free — no manual re-run.
 *
 * Scope + safety:
 *  - Only automation runs (we have the goal + can re-dispatch deterministically).
 *  - Only runs whose ONLY outstanding needs were browser logins (a run that also
 *    needed a Composio connection is left for a manual/Composio-triggered re-run,
 *    so we never re-run while something is still missing).
 *  - Dedup: skip if a run for the automation is already in flight or was just
 *    created; one re-dispatch per call. Re-uses the blocked run's cloud_agent.
 *  - Best-effort: logs + swallows errors so saving a login never fails on this.
 */
export async function autoRerunAfterBrowserLogin(workspaceId: string, host: string): Promise<void> {
  try {
    const h = host.trim().toLowerCase().replace(/^www\./, '')
    const candidates = (await db.execute(sql`
      SELECT r.id::text AS id, r.account_id::text AS account_id, r.cloud_agent_id::text AS cloud_agent_id,
             r.automation_id::text AS automation_id, r.automation_version, r.inputs, r.dry_run
        FROM public.cloud_runs r
       WHERE r.workspace_id = ${workspaceId}
         AND r.automation_id IS NOT NULL
         AND r.status IN ('completed','failed','failed_orphaned')
         AND r.created_at > now() - interval '6 hours'
         AND EXISTS (
           SELECT 1 FROM public.cloud_activity a
            WHERE a.agent_run_id = r.id
              AND a.activity_type = 'browser_login_required'
              AND lower(a.payload->>'host') IN (${h}, ${'www.' + h})
         )
         -- Conservative: don't auto-re-run runs that also need a Composio
         -- connection (no clean "connection active" trigger for those yet).
         AND NOT EXISTS (
           SELECT 1 FROM public.cloud_activity a2
            WHERE a2.agent_run_id = r.id AND a2.activity_type = 'connection_expired'
         )
       ORDER BY r.created_at DESC
       LIMIT 5
    `)) as unknown as Array<{
      id: string
      account_id: string
      cloud_agent_id: string
      automation_id: string
      automation_version: number | null
      inputs: unknown
      dry_run: boolean | null
    }>

    for (const run of candidates) {
      // Every browser login this run asked for must now be saved + unexpired.
      const unmet = (await db.execute(sql`
        WITH needs AS (
          SELECT DISTINCT lower(a.payload->>'host') AS host
            FROM public.cloud_activity a
           WHERE a.agent_run_id = ${run.id}
             AND a.activity_type = 'browser_login_required'
             AND a.payload->>'host' IS NOT NULL
        )
        SELECT count(*)::int AS n FROM needs nd
         WHERE NOT EXISTS (
           SELECT 1 FROM public.workspace_browser_sites ws
            WHERE ws.workspace_id = ${workspaceId}
              AND lower(ws.host) = nd.host
              AND ws.expires_at > now()
         )
      `)) as unknown as Array<{ n: number }>
      if ((unmet[0]?.n ?? 1) > 0) continue

      // Dedup: a run for this automation is already in flight or just created.
      const recent = (await db.execute(sql`
        SELECT 1 FROM public.cloud_runs
         WHERE automation_id = ${run.automation_id}
           AND (status IN ('pending','running') OR created_at > now() - interval '3 minutes')
         LIMIT 1
      `)) as unknown as Array<unknown>
      if (recent.length > 0) return

      const autoRows = (await db.execute(sql`
        SELECT name, goal, archived_at FROM public.automations
         WHERE id = ${run.automation_id} AND workspace_id = ${workspaceId} LIMIT 1
      `)) as unknown as Array<{ name: string; goal: string; archived_at: string | null }>
      const auto = autoRows[0]
      if (!auto || auto.archived_at) continue

      const queueUrl = getConfig().RUNS_QUEUE_URL
      if (!queueUrl) {
        logger.warn({ workspaceId }, 'auto-rerun: RUNS_QUEUE_URL not configured')
        return
      }

      const newRunId = randomUUID()
      const inputs = (run.inputs ?? {}) as Record<string, unknown>
      const mode: 'dry' | 'live' = run.dry_run ? 'dry' : 'live'
      await db.execute(sql`
        INSERT INTO public.cloud_runs
          (id, cloud_agent_id, workspace_id, account_id, status, run_mode,
           automation_id, automation_version, triggered_by, inputs, dry_run)
        VALUES
          (${newRunId}, ${run.cloud_agent_id}, ${workspaceId}, ${run.account_id}, 'pending', 'live',
           ${run.automation_id}, ${run.automation_version ?? 1}, 'connection_provided',
           ${JSON.stringify(inputs)}::jsonb, ${run.dry_run ?? false})
      `)
      const wrappedGoal = wrapAutomationGoal(auto.name, auto.goal, inputs, mode, 'connection_provided')
      await sqsClient().send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({
            runId: newRunId,
            workspaceId,
            accountId: run.account_id,
            goal: wrappedGoal,
            automationId: run.automation_id,
            automationVersion: run.automation_version ?? 1,
            triggeredBy: 'connection_provided',
            inputs,
          }),
          MessageGroupId: workspaceId,
          MessageDeduplicationId: newRunId,
        }),
      )
      logger.info(
        { workspaceId, host: h, automationId: run.automation_id, blockedRun: run.id, newRunId },
        'auto-rerun: re-dispatched automation after browser login',
      )
      return // one re-dispatch per connection event
    }
  } catch (err) {
    logger.warn(
      { workspaceId, host, err: err instanceof Error ? err.message : String(err) },
      'auto-rerun: failed',
    )
  }
}
