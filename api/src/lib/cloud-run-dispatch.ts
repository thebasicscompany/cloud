import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getConfig } from '../config.js'
import { db } from '../db/index.js'
import type { WorkspaceToken } from './jwt.js'
import { planLimits, PlanLimitError } from './plan-limits.js'

export const UUID_RE = /^[0-9a-fA-F-]{36}$/

/**
 * J.2 — wrap an automation's goal text for a worker dispatch so the
 * agent EXECUTES the pipeline once instead of re-interpreting the spec
 * as a new authoring task.
 *
 * Background: automation goal text is typically written as a pipeline
 * description ("For each LP row in the sheet, do X then Y..."). Without
 * explicit framing, the worker agent treats it as a fresh design request
 * and either (a) calls propose_automation again (creating duplicates),
 * (b) lectures the user about tool limitations, or (c) refuses to act.
 * Surfaced on the J.1 LP-mapping live test: dry-run 84b72c5a recursed,
 * manual run 75000832 refused-with-limitations summary.
 *
 * `mode='dry'`  — every mutating outbound call is captured by the dry-run
 *                  interceptor; tells the agent that's expected.
 * `mode='live'` — mutating calls fire for real; tells the agent to be
 *                  careful and to follow approval prompts.
 *
 * Apply this wrap at EVERY dispatch site that sends `goal: automation.goal`
 * to SQS: manual /:id/run, /:id/dry-run, /draft-from-chat dry-run,
 * composio-webhook-triggered runs (D.5), schedule-fired runs (D.6).
 */
export function wrapAutomationGoal(
  automationName: string,
  goal: string,
  inputs: Record<string, unknown> | unknown,
  mode: 'dry' | 'live',
  triggeredBy?: string,
): string {
  const inputsJson = JSON.stringify(inputs ?? {}, null, 2)
  const header =
    mode === 'dry'
      ? `DRY RUN — execute the automation "${automationName}" defined below ONE TIME. The automation is already drafted in the database; you are testing what one pass through its pipeline would do.`
      : `EXECUTING automation "${automationName}" — the trigger fired (${triggeredBy ?? 'manual'}); make ONE pass through the pipeline below. The automation is already active in the database; do NOT re-author it.`

  const rules =
    mode === 'dry'
      ? `DRY-RUN RULES (the runtime enforces these — don't fight them):
- Do NOT call propose_automation. The draft already exists; calling it again creates duplicates.
- Do NOT call activate_automation.
- Do NOT recurse into a fresh authoring session, do not iterate the pipeline more than once.
- Every mutating outbound call (Gmail send, SMS, Composio writes that create/update/delete rows) is silently captured by the dry-run interceptor — they will NOT actually fire. That's expected; do the work normally.
- After one pipeline pass, emit a single final-answer message summarizing what the pipeline did (or would have done) and stop.`
      : `LIVE-RUN RULES:
- Do NOT call propose_automation or activate_automation. This is an EXECUTION of an already-active automation, not authoring.
- Do NOT lecture the user about tool capabilities, do not refuse, do not ask for clarification mid-run. The user already approved this pipeline at activation time. Just run it.
- Mutating outbound calls (Gmail send, SMS, Composio create/update/delete) WILL fire for real. The runtime gates risky ones via approval prompts to the user; trust the approval system.
- Use the browser tool (you have logged-in cookies for the workspace's pre-loaded sites) for anything Composio doesn't cover. Do not recommend external SaaS.
- Make exactly one pass through the pipeline for whatever input row/event triggered this run. Then emit a final-answer summary and stop.

END-OF-RUN STATE VERIFICATION (J.16, mandatory):
- After your last mutating write, re-read the affected row(s) from the source sheet (or whatever state-of-truth your pipeline writes to) and confirm every column you intended to write actually contains the expected value.
- If your pipeline involves Gmail/Calendar/other side-effects, query the side-effect (list drafts / list events / etc.) and confirm what you intended got created.
- If ANY check fails (a cell has the wrong value, a draft you tried to create doesn't exist, a mutual you scored isn't in the Mutuals tab), DO NOT emit final_answer with a success summary. Instead, surface the exact discrepancy and either retry the failing write or fail loud. Never narrate "I did X" without confirming X is actually in the state-of-truth.
- This is to catch a failure class where Composio returns ok:true on a write that silently landed in the wrong cell (param-shape footgun), or where you tried to call a tool that ended up no-oping. Verify before declaring success.

GOOGLESHEETS PARAM CONVENTION (J.10/J.17, follow strictly):
- For any GOOGLESHEETS_* tool with a \`range\` field, always single-quote the sheet name in A1 notation when it contains whitespace or punctuation: \`'LP Pipeline'!G2\`, not \`LP Pipeline!G2\` (silently misroutes writes).
- Stick to GOOGLESHEETS_VALUES_UPDATE for single-cell or single-range writes and GOOGLESHEETS_BATCH_UPDATE for multi-range writes. Don't bounce between slug variants on retry — if a write fails, fix the input shape, don't try a different slug name.

PER-WRITE VERIFICATION (J.14, mandatory for mutating Composio calls):
- After every GOOGLESHEETS_VALUES_UPDATE / GOOGLESHEETS_BATCH_UPDATE / similar mutating call, IMMEDIATELY follow with a GOOGLESHEETS_BATCH_GET on the same range and assert the cell values match what you intended to write.
- If the read-back shows a different value (e.g. you wrote 'Mapping' to G2 but the read-back returns 'Mapping' in A3 — known param-shape footgun), the write went to the wrong cell. DO NOT retry with a different slug name — that's a retry-storm pattern that fills the sheet with garbage. Instead, surface the drift and either correct the parameters (single-quote the sheet name, drop conflicting sheet_name+range combo, etc.) or fail loud.
- Same pattern for GMAIL_CREATE_EMAIL_DRAFT: after the call, GMAIL_LIST_DRAFTS or GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID with the returned draft id and confirm the To/Subject/Body match what you sent.
- Verification reads are cheap (~100ms) compared to the cost of pipelines silently writing to wrong cells and humans hunting down phantom state.

AGENT-AUTHORED HELPERS + SKILLS (K.6/K.7 — token-decay MANDATORY):
- If you see a <helpers> block, scan it FIRST. If exactly one helper's args_schema matches the input shape AND its description matches what this run needs, call \`helper_call({helperName, args})\` as your FIRST tool call. If it succeeds, call \`final_answer\` and stop. One LLM turn total.
- If helper throws/errors: call underlying tools directly to finish the run, THEN call \`helper_write\` with \`supersedes_helper_id\` set.
- MANDATORY skill_write — at the end of EVERY successful run that used the browser tool, you MUST call \`skill_write\` capturing what you learned, BEFORE calling final_answer. Examples to capture:
  * Selectors (CSS / XPath / aria-label) for the elements you clicked or extracted from on each host. The next run shouldn't have to screenshot to find them.
  * Navigation sequences (URL templates, search query parameters, button-click order) that worked.
  * Quirks (a button that opens a dialog vs a popup; a search that requires scrolling for results to render; a list that lazy-loads on scroll).
  * Mapping rules you applied (e.g. score formula, filter thresholds, name-disambiguation heuristics).
  Set \`host\` for site-scoped skills (linkedin.com, docs.google.com). Body MUST include a "Last-verified: YYYY-MM-DD" line, the selectors, the required interaction sequence, and a concrete example. Multiple skill_write calls per run are fine if you learned multiple distinct things.
- MANDATORY helper_write — at the end of EVERY successful run where the agent (you) reached final_answer through a tool sequence that could be re-run deterministically given the same input shape, you MUST call \`helper_write\` BEFORE final_answer. Reasonable definition: if you had no major LLM judgment calls and the structure was "read X → process → write Y", that's compileable. The body should orchestrate the tool sequence using ctx.composio() / ctx.browser; the args_schema should describe the input shape (e.g. for an LP-row pipeline: \`{row: {LP_Full_Name, Firm, LinkedIn_URL?}, sheet_name, spreadsheet_id, row_number}\`). If you genuinely had hard LLM judgment in the middle (e.g. "score this reply as positive/negative"), skip helper_write — just emit skill_write for what you learned.
- Even on first run with novel input, you should be able to write at least skill_write. Don't skip these tools — they're the difference between an agent that re-derives everything each fire and one that decays toward zero LLM cost per run.`

  const tailHint =
    `If the automation's trigger normally fires on a specific row/event and the pre-resolved inputs below don't carry one, pick the first concrete candidate yourself by reading the relevant data source (e.g. fetch the first matching row from the trigger's source sheet). Don't ask the user — pick.`

  return `${header}

${rules}

${tailHint}

============== AUTOMATION GOAL (the pipeline to execute) ==============
${goal}
============== END AUTOMATION GOAL ==============

Pre-resolved inputs from the trigger config:
\`\`\`json
${inputsJson}
\`\`\`

Now execute one pass through the pipeline. Then stop.`
}

let _sqs: SQSClient | null = null

function sqsClient(): SQSClient {
  if (!_sqs) _sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
  return _sqs
}

/**
 * Where the dispatched run's browser work executes. Persisted to
 * `cloud_runs.browser_target`; the worker reads it at opencode session boot
 * (`resolveBinding`) to decide whether to attach to Browserbase ('cloud'),
 * drive the user's local Chrome through the relay ('local_relay'), or run pure
 * local computer-use without launching any browser ('local_compute').
 */
export type BrowserTarget = 'cloud' | 'local_compute' | 'local_relay'

export type DispatchCloudRunInput = {
  workspace: WorkspaceToken
  goal: string
  cloudAgentId?: string
  laneId?: string
  model?: string
  adHocDefinition?: string
  /**
   * Override the cloud_agents.agent_id key used for lookup/insert. Defaults
   * to 'ad-hoc' (shared bucket). Pass an agent-specific key (e.g. the
   * Basics-agent's name or id) so each named agent gets its OWN cloud_agents
   * row — that's what the run-views layer surfaces as `workflowName` in
   * Activity, so without this every run from every Basics-agent shows as
   * "ad-hoc".
   */
  agentKey?: string
  /** Defaults to 'cloud' (Browserbase). */
  browserTarget?: BrowserTarget
  /** Per-run relay session id — paired with browserTarget='local_relay'. */
  relaySession?: string
  /** When true, screenshots are not persisted (local runs). */
  ephemeral?: boolean
}

export type DispatchCloudRunResult = {
  runId: string
  status: 'pending'
  cloudAgentId: string
  liveViewUrl: null
  eventsUrl: string
}

async function resolveCloudAgentId(input: {
  workspace: WorkspaceToken
  cloudAgentId?: string
  adHocDefinition: string
  agentKey: string
}): Promise<string | null> {
  const ws = input.workspace.workspace_id
  const acc = input.workspace.account_id

  if (input.cloudAgentId) {
    const rows = (await db.execute(sql`
      SELECT id FROM public.cloud_agents
       WHERE id = ${input.cloudAgentId} AND workspace_id = ${ws}
       LIMIT 1
    `)) as unknown as Array<{ id: string }>
    return rows[0]?.id ?? null
  }

  // Look up by the caller-supplied key (defaults to 'ad-hoc' for legacy /v1/runs
  // dispatches). Named agents pass agentKey = agent.name so each gets its own
  // cloud_agents row → run-views surfaces it as workflowName in Activity.
  const existing = (await db.execute(sql`
    SELECT id FROM public.cloud_agents
     WHERE workspace_id = ${ws} AND agent_id = ${input.agentKey}
     LIMIT 1
  `)) as unknown as Array<{ id: string }>
  if (existing[0]) return existing[0].id

  const created = (await db.execute(sql`
    INSERT INTO public.cloud_agents
      (workspace_id, account_id, agent_id, definition, schedule, status, composio_user_id, runtime_mode)
    VALUES
      (${ws}, ${acc}, ${input.agentKey}, ${input.adHocDefinition},
       'manual', 'active', ${ws}, 'harness')
    RETURNING id
  `)) as unknown as Array<{ id: string }>
  return created[0]!.id
}

export async function dispatchCloudRun(
  input: DispatchCloudRunInput,
): Promise<DispatchCloudRunResult | null> {
  const ws = input.workspace.workspace_id
  const acc = input.workspace.account_id

  // Plan limit: concurrent cloud runs. Counts in-flight runs for the workspace
  // and blocks (402 at the route) once the plan ceiling is reached. Checked
  // before creating the ad-hoc agent so a blocked dispatch leaves no rows.
  // null = unlimited (enterprise).
  const limits = planLimits(input.workspace.plan)
  if (limits.maxConcurrentRuns !== null) {
    const active = (await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM public.cloud_runs
       WHERE workspace_id = ${ws} AND status IN ('pending','running')
    `)) as unknown as Array<{ cnt: number }>
    if ((active[0]?.cnt ?? 0) >= limits.maxConcurrentRuns) {
      throw new PlanLimitError(
        'concurrency_limit',
        `Your plan runs ${limits.maxConcurrentRuns} cloud task${limits.maxConcurrentRuns === 1 ? '' : 's'} at a time. Wait for one to finish or upgrade for more.`,
      )
    }
  }

  const cloudAgentId = await resolveCloudAgentId({
    workspace: input.workspace,
    cloudAgentId: input.cloudAgentId,
    agentKey: input.agentKey ?? 'ad-hoc',
    adHocDefinition:
      input.adHocDefinition ?? 'One-shot runs dispatched via POST /v1/runs',
  })
  if (!cloudAgentId) return null

  const runId = randomUUID()
  // Default to 'cloud' so existing callers (which never set browserTarget) keep
  // the Browserbase path unchanged. relay_session / ephemeral are only set for
  // the local-run flows; null/false otherwise. The worker reads these columns
  // from the run row at session boot (resolveBinding).
  const browserTarget: BrowserTarget = input.browserTarget ?? 'cloud'
  const relaySession = input.relaySession ?? null
  const ephemeral = input.ephemeral ?? false

  const queueUrl = getConfig().RUNS_QUEUE_URL
  if (!queueUrl) {
    throw new Error('runs_queue_not_configured')
  }
  const groupId = `${ws}:${input.laneId ?? 'default'}`

  // Insert the row, then enqueue to SQS. If SQS fails (IAM, network, rolling
  // deploy hiccup), compensate by deleting the row so we don't leave an
  // orphan cloud_runs row that sits in `pending` forever — that's exactly the
  // failure mode that left dmrknife's run stuck for 13 minutes on 2026-06-02
  // until the SQS IAM policy was attached. The sweepStaleRuns() function
  // below is the belt-and-suspenders safety net for any future class of
  // commit-succeeded-but-enqueue-lost failures we haven't accounted for.
  await db.execute(sql`
    INSERT INTO public.cloud_runs
      (id, cloud_agent_id, workspace_id, account_id, status, run_mode,
       browser_target, relay_session, ephemeral)
    VALUES
      (${runId}, ${cloudAgentId}, ${ws}, ${acc}, 'pending', 'live',
       ${browserTarget}, ${relaySession}, ${ephemeral})
  `)
  try {
    await sqsClient().send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        runId,
        workspaceId: ws,
        accountId: acc,
        goal: input.goal,
        ...(input.model ? { model: input.model } : {}),
      }),
      MessageGroupId: groupId,
      MessageDeduplicationId: runId,
    }))
  } catch (sqsErr) {
    // Best-effort compensating delete. If this also fails, the sweeper
    // catches the orphan within a few minutes — that's the contract.
    await db
      .execute(sql`DELETE FROM public.cloud_runs WHERE id = ${runId} AND status = 'pending'`)
      .catch((e) => {
        // Surface but don't mask the original SQS error.
        // eslint-disable-next-line no-console
        console.error('dispatch: compensating delete failed', e)
      })
    throw sqsErr
  }

  return {
    runId,
    status: 'pending',
    cloudAgentId,
    liveViewUrl: null,
    eventsUrl: `/v1/runs/${runId}/events`,
  }
}

/**
 * Stale-run sweeper. Marks any `cloud_runs` row whose status is `pending` or
 * `running` and whose most recent timestamp (`last_progress_at` ?? `started_at`
 * ?? `created_at`) is older than `thresholdMinutes` as `failed` with
 * `failure_reason='dispatcher_timeout'`.
 *
 * This is the safety net for the entire dispatch path. Any failure mode that
 * leaves a row in a non-terminal state — SQS denial, worker boot crash, pool
 * NOTIFY lost, network partition during a rolling deploy — gets cleaned up
 * within `thresholdMinutes` instead of showing the user a fake "running"
 * spinner forever. Idempotent: re-running it is harmless.
 */
export async function sweepStaleRuns(
  thresholdMinutes = 5,
): Promise<{ swept: string[] }> {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE public.cloud_runs
       SET status = 'failed',
           failed_at = NOW(),
           completed_at = NOW(),
           failure_reason = 'dispatcher_timeout',
           error_message = 'No progress within ' || ${thresholdMinutes}::text || ' minutes — worker crash, SQS enqueue lost, or rolling deploy. Auto-failed by sweepStaleRuns.'
     WHERE status IN ('pending', 'running')
       AND COALESCE(last_progress_at, started_at, created_at) < NOW() - (${thresholdMinutes}::text || ' minutes')::interval
   RETURNING id
  `)
  // drizzle's postgres-js `execute` returns the RowList array directly.
  const swept = (rows as unknown as Array<{ id: string }>).map((r) => r.id)
  if (swept.length > 0) {
    // eslint-disable-next-line no-console
    console.log('dispatch: sweepStaleRuns failed orphaned runs', {
      count: swept.length,
      ids: swept,
      thresholdMinutes,
    })
  }
  return { swept }
}
