import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import { getConfig } from '../config.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

/**
 * Runs / activity read model — the BIGGEST renderer data domain.
 *
 * Ported VERBATIM from the web data lib `web/src/lib/cloud-data.ts`, but scoped
 * to the VERIFIED workspace JWT (`c.var.workspace.workspace_id`) instead of a
 * service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID. Every read is
 * filtered by the token's workspace, so this can power the renderer directly
 * (no admin key on the client, no cross-workspace leak), and the Browserbase
 * API key for live-view resolution stays server-side.
 *
 *   GET /v1/run-views                         → { runs: Run[] }
 *     query: ?automationId= ?limit= ?since=
 *   GET /v1/run-views/activity                → { events: PlatformEvent[] }
 *   GET /v1/run-views/pending-actions         → { actions: PendingAction[] }
 *   GET /v1/run-views/:id                      → { run: Run | null }
 *   GET /v1/run-views/:id/steps               → { steps: RunStep[] }
 *   GET /v1/run-views/:id/needs               → { connectionNeeds, browserLoginNeeds }
 *   GET /v1/run-views/:id/live-view           → { liveViewUrl: string | null }
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const runViewsRoute = new Hono<{ Variables: Vars }>()

// ─── View-model types (mirrors web/src/types/runs + platform-events) ─────────

type RunStatus =
  | 'pending'
  | 'booting'
  | 'running'
  | 'paused'
  | 'paused_by_user'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'stopped'
type RunTrigger = 'manual' | 'scheduled' | 'api'
type RunStepKind = 'model_thinking' | 'tool_call' | 'approval' | 'check'

interface RunStepPayloadToolCall {
  kind: 'tool_call'
  toolName: string
  params: Record<string, unknown>
  result?: Record<string, unknown>
  error?: string
  durationMs: number
}
interface RunStepPayloadApproval {
  kind: 'approval'
  approvalId: string
  action: string
  status: 'pending' | 'approved'
}
interface RunStepPayloadCheck {
  kind: 'check'
  checkName: string
  passed: boolean
  evidence: { detail: string }
}
interface RunStepPayloadThinking {
  kind: 'model_thinking'
  text: string
}
type RunStepPayload =
  | RunStepPayloadToolCall
  | RunStepPayloadApproval
  | RunStepPayloadCheck
  | RunStepPayloadThinking

interface Run {
  id: string
  workflowId: string
  workflowName: string
  workspaceId: string
  status: RunStatus
  trigger: RunTrigger
  takeoverActive: boolean
  startedAt: string
  completedAt?: string
  stepCount: number
  errorSummary?: string
  runtime: string
  executionTarget: string
  actorAccountId?: string
  browserbaseSessionId?: string
  liveUrl?: string
  recordingUrl?: string
  resultSummary?: string
}

interface RunStep {
  id: string
  runId: string
  stepIndex: number
  kind: RunStepKind
  payload: RunStepPayload
  createdAt: string
}

type PlatformEventSource = 'approval' | 'agent' | 'cloud'
type PlatformEventStatus =
  | 'running'
  | 'completed'
  | 'revoked'
  | 'failed'
  | 'blocked'
  | 'info'

interface PlatformEvent {
  id: string
  workspace_id: string
  actor_account_id: string
  run_id?: string
  source: PlatformEventSource
  actor_type: 'agent'
  event_type: string
  privacy_class: 'action_log'
  redaction_state: 'summarized'
  target: 'cloud'
  execution_target: 'cloud'
  status: PlatformEventStatus
  created_at: string
  payload_inline: Record<string, unknown>
  labels: string[]
}

interface PendingAction {
  runId: string
  kind: 'browser_login' | 'connection'
  label: string
}

// ─── Maps (ported verbatim from cloud-data.ts) ───────────────────────────────

const RUN_STATUS: Record<string, RunStatus> = {
  pending: 'pending',
  queued: 'pending',
  booting: 'booting',
  running: 'running',
  paused_for_approval: 'paused',
  awaiting_user: 'paused_by_user',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'stopped',
  stopped: 'stopped',
}

const RUN_TRIGGER: Record<string, RunTrigger> = {
  manual: 'manual',
  schedule: 'scheduled',
  composio_webhook: 'api',
  dry_run: 'manual',
}

const STEP_KIND: Record<string, RunStepKind> = {
  plan: 'model_thinking',
  resume: 'model_thinking',
  tool_execution: 'tool_call',
  approval_wait: 'approval',
}

const RUN_SELECT =
  'id,automation_id,cloud_agent_id,workspace_id,account_id,status,started_at,completed_at,created_at,last_progress_at,duration_seconds,result_summary,error_message,failure_reason,run_mode,browser_target,browserbase_session_id,live_view_url,recording_url,triggered_by,automations(name),cloud_agents(agent_id)'

// Statuses the UI renders as "live". A run that claims one of these but hasn't
// progressed in STALE_MS is treated as orphaned for display, so a dead worker
// can never surface as a multi-day "running" card.
const LIVE_STATUSES = new Set<RunStatus>([
  'pending',
  'booting',
  'running',
  'paused',
  'paused_by_user',
  'verifying',
])
const STALE_MS = 30 * 60 * 1000

function mapRun(r: Record<string, unknown>): Run {
  const automation = (Array.isArray(r.automations) ? r.automations[0] : r.automations) as
    | { name?: string }
    | null
  const agent = (Array.isArray(r.cloud_agents) ? r.cloud_agents[0] : r.cloud_agents) as
    | { agent_id?: string }
    | null
  const name = automation?.name ?? agent?.agent_id ?? 'Cloud run'
  let status: RunStatus = RUN_STATUS[(r.status as string) ?? ''] ?? 'pending'
  // Self-healing: a "live" run with no progress for >30m is orphaned.
  const lastProgress =
    (r.last_progress_at as string) ?? (r.started_at as string) ?? (r.created_at as string)
  const orphaned =
    LIVE_STATUSES.has(status) &&
    Boolean(lastProgress) &&
    Date.now() - new Date(lastProgress).getTime() > STALE_MS
  if (orphaned) status = 'failed'
  return {
    id: r.id as string,
    workflowId: (r.automation_id as string) ?? (r.cloud_agent_id as string) ?? '',
    workflowName: name,
    workspaceId: r.workspace_id as string,
    status,
    trigger: RUN_TRIGGER[(r.triggered_by as string) ?? ''] ?? 'manual',
    takeoverActive: false,
    startedAt: (r.started_at as string) ?? (r.created_at as string) ?? new Date().toISOString(),
    completedAt: (r.completed_at as string) ?? undefined,
    stepCount: 0,
    errorSummary:
      (r.error_message as string) ??
      (r.failure_reason as string) ??
      (orphaned ? 'Orphaned — no worker progress for 30m+' : undefined),
    runtime: (r.run_mode as string) ?? 'cloud',
    // executionTarget surfaces what the run's browser actually attached to,
    // which the UI maps to a friendly label. Was hardcoded to 'basics_cloud'
    // for every run regardless of target — so a computer-use run looked like
    // a cloud run in the UI. Map the cloud_runs.browser_target column:
    //   'cloud'         → 'cloud'      (Browserbase)
    //   'local_compute' → 'computer'   (pure macOS computer-use)
    //   'local_relay'   → 'chrome'     (user's Chrome via relay)
    executionTarget:
      (r.browser_target as string) === 'local_compute'
        ? 'computer'
        : (r.browser_target as string) === 'local_relay'
          ? 'chrome'
          : 'cloud',
    actorAccountId: (r.account_id as string) ?? undefined,
    browserbaseSessionId: (r.browserbase_session_id as string) ?? undefined,
    liveUrl: (r.live_view_url as string) ?? undefined,
    recordingUrl: (r.recording_url as string) ?? undefined,
    resultSummary: (r.result_summary as string) ?? undefined,
  }
}

// ─── GET / — list runs (getCloudRuns) ────────────────────────────────────────

runViewsRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const automationId = c.req.query('automationId')
  const limitRaw = Number(c.req.query('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100
  const since = c.req.query('since')
  const supabase = supabaseAdmin()

  let query = supabase.from('cloud_runs').select(RUN_SELECT).eq('workspace_id', ws)
  if (automationId) query = query.eq('automation_id', automationId)
  if (since) query = query.gte('created_at', since)
  const { data } = await query.order('created_at', { ascending: false }).limit(limit)
  const runs = (data ?? []).map(mapRun)

  // Backfill step counts in one grouped pass (avoids N+1).
  const ids = runs.map((r) => r.id)
  if (ids.length) {
    const { data: steps } = await supabase
      .from('cloud_run_steps')
      .select('agent_run_id')
      .in('agent_run_id', ids)
    const counts = new Map<string, number>()
    for (const s of steps ?? []) {
      const k = s.agent_run_id as string
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    for (const r of runs) r.stepCount = counts.get(r.id) ?? 0
  }
  return c.json({ runs })
})

// ─── GET /activity — platform events (getCloudActivityEvents) ────────────────

const ACTIVITY_STATUS: Record<string, PlatformEventStatus> = {
  run_started: 'running',
  run_completed: 'completed',
  run_cancelled: 'revoked',
  run_system_error: 'failed',
  tool_call_failed: 'failed',
  pending_approval: 'blocked',
  final_answer: 'completed',
}

function activitySource(type: string): PlatformEventSource {
  if (type === 'pending_approval') return 'approval'
  if (type.startsWith('browser_') || type.startsWith('browserbase')) return 'agent'
  return 'cloud'
}

runViewsRoute.get('/activity', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const limitRaw = Number(c.req.query('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 300
  const supabase = supabaseAdmin()

  const { data } = await supabase
    .from('cloud_activity')
    .select('id,agent_run_id,workspace_id,account_id,activity_type,payload,created_at')
    .eq('workspace_id', ws)
    .order('created_at', { ascending: false })
    .limit(limit)

  const events: PlatformEvent[] = (data ?? []).map((a) => {
    const type = (a.activity_type as string) ?? 'event'
    const payload = (a.payload ?? {}) as Record<string, unknown>
    return {
      id: a.id as string,
      workspace_id: (a.workspace_id as string) ?? '',
      actor_account_id: (a.account_id as string) ?? '',
      run_id: (a.agent_run_id as string) ?? undefined,
      source: activitySource(type),
      actor_type: 'agent',
      event_type: type,
      privacy_class: 'action_log',
      redaction_state: 'summarized',
      target: 'cloud',
      execution_target: 'cloud',
      status: ACTIVITY_STATUS[type] ?? 'info',
      created_at: (a.created_at as string) ?? new Date().toISOString(),
      payload_inline: payload,
      labels: [],
    }
  })
  return c.json({ events })
})

// ─── GET /pending-actions — workspace "waiting on you" (getWorkspacePendingActions) ─

runViewsRoute.get('/pending-actions', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const supabase = supabaseAdmin()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('cloud_activity')
    .select('agent_run_id,activity_type,payload,created_at')
    .eq('workspace_id', ws)
    .in('activity_type', ['browser_login_required', 'connection_expired'])
    .gt('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(200)

  const { data: saved } = await supabase
    .from('workspace_browser_sites')
    .select('host')
    .eq('workspace_id', ws)
    .gt('expires_at', new Date().toISOString())
  const savedHosts = new Set(
    (saved ?? []).map((s) => ((s.host as string) ?? '').toLowerCase().replace(/^www\./, '')),
  )

  // Drop Composio needs for toolkits that are ALREADY connected now (the
  // connection_expired row may be stale from before the user connected it).
  // Mirrors the web lib's getConnections(ws) dedup: connected = the toolkit
  // cache slugs + the stored-credential kinds.
  const [{ data: toolkitRows }, { data: credRows }] = await Promise.all([
    supabase.from('composio_tool_cache').select('toolkit_slug').eq('workspace_id', ws),
    supabase.from('workspace_credentials').select('kind').eq('workspace_id', ws),
  ])
  const connectedToolkits = new Set(
    (toolkitRows ?? [])
      .map((t) => ((t.toolkit_slug as string) ?? '').toLowerCase())
      .concat((credRows ?? []).map((cr) => ((cr.kind as string) ?? '').toLowerCase())),
  )

  const seen = new Set<string>()
  const out: PendingAction[] = []
  for (const row of data ?? []) {
    const runId = (row.agent_run_id as string) ?? ''
    const payload = (row.payload ?? {}) as Record<string, unknown>
    if (!runId) continue
    if (row.activity_type === 'browser_login_required') {
      const host =
        typeof payload.host === 'string' ? payload.host.toLowerCase().replace(/^www\./, '') : ''
      if (!host || savedHosts.has(host)) continue
      const k = `b:${runId}:${host}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ runId, kind: 'browser_login', label: host })
    } else {
      const slug = String(
        payload.toolkitSlug ?? payload.toolkit_slug ?? payload.toolkit ?? '',
      ).toLowerCase()
      if (!slug || connectedToolkits.has(slug)) continue // skip already-connected toolkits
      const k = `c:${runId}:${slug}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ runId, kind: 'connection', label: slug })
    }
  }
  return c.json({ actions: out.slice(0, 8) })
})

// ─── GET /:id — single run (getCloudRunById) ─────────────────────────────────

runViewsRoute.get('/:id', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const id = c.req.param('id')
  const supabase = supabaseAdmin()

  const { data } = await supabase
    .from('cloud_runs')
    .select(RUN_SELECT)
    .eq('id', id)
    .eq('workspace_id', ws)
    .maybeSingle()
  if (!data) return c.json({ run: null }, 404)
  const run = mapRun(data)
  const { count } = await supabase
    .from('cloud_run_steps')
    .select('id', { count: 'exact', head: true })
    .eq('agent_run_id', id)
  run.stepCount = count ?? 0
  return c.json({ run })
})

// ─── GET /:id/steps — run steps + cloud_activity fallback (getCloudRunSteps) ──

runViewsRoute.get('/:id/steps', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const runId = c.req.param('id')
  const supabase = supabaseAdmin()

  // Ownership guard — only return steps for a run in this workspace.
  const { data: owner } = await supabase
    .from('cloud_runs')
    .select('id')
    .eq('id', runId)
    .eq('workspace_id', ws)
    .maybeSingle()
  if (!owner) return c.json({ steps: [] })

  const { data } = await supabase
    .from('cloud_run_steps')
    .select(
      'id,agent_run_id,step_number,kind,payload,status,created_at,check_passed,check_evidence,gating_reason',
    )
    .eq('agent_run_id', runId)
    .order('step_number', { ascending: true })
    .limit(500)

  // Harness runs record their trace in cloud_activity rather than
  // cloud_run_steps; fall back to the real activity stream so the run
  // detail shows the actual execution timeline.
  if ((data ?? []).length === 0) {
    const { data: acts } = await supabase
      .from('cloud_activity')
      .select('id,agent_run_id,activity_type,payload,created_at')
      .eq('agent_run_id', runId)
      .order('created_at', { ascending: true })
      .limit(500)
    const steps: RunStep[] = (acts ?? []).map((a, i) => {
      const type = (a.activity_type as string) ?? 'event'
      const raw = (a.payload ?? {}) as Record<string, unknown>
      let kind: RunStepKind = 'model_thinking'
      let payload: RunStepPayload
      if (type.startsWith('tool_call') || type === 'oc.tool_use') {
        kind = 'tool_call'
        payload = {
          kind: 'tool_call',
          toolName: (raw.tool_name as string) ?? (raw.name as string) ?? type,
          params: (raw.args as Record<string, unknown>) ?? {},
          result: (raw.result as Record<string, unknown>) ?? undefined,
          durationMs: 0,
        }
      } else if (type === 'pending_approval') {
        kind = 'approval'
        payload = {
          kind: 'approval',
          approvalId: (raw.approval_id as string) ?? '',
          action: type,
          status: 'pending',
        }
      } else {
        payload = {
          kind: 'model_thinking',
          text:
            (raw.text as string) ??
            (raw.message as string) ??
            (raw.summary as string) ??
            type,
        }
      }
      return {
        id: a.id as string,
        runId,
        stepIndex: i,
        kind,
        payload,
        createdAt: (a.created_at as string) ?? new Date().toISOString(),
      }
    })
    return c.json({ steps })
  }

  const steps: RunStep[] = (data ?? []).map((s) => {
    const kind = STEP_KIND[(s.kind as string) ?? ''] ?? 'model_thinking'
    const raw = (s.payload ?? {}) as Record<string, unknown>
    let payload: RunStepPayload
    if (kind === 'tool_call') {
      payload = {
        kind: 'tool_call',
        toolName:
          (raw.tool_name as string) ?? (raw.toolName as string) ?? (s.kind as string) ?? 'tool',
        params: (raw.args as Record<string, unknown>) ?? (raw.params as Record<string, unknown>) ?? {},
        result: (raw.result as Record<string, unknown>) ?? undefined,
        error: (raw.error as string) ?? undefined,
        durationMs: Number(raw.duration_ms ?? 0),
      }
    } else if (kind === 'approval') {
      payload = {
        kind: 'approval',
        approvalId: (raw.approval_id as string) ?? '',
        action: (raw.tool_name as string) ?? (s.gating_reason as string) ?? 'approval',
        status: s.status === 'completed' ? 'approved' : 'pending',
      }
    } else if (s.check_passed != null) {
      payload = {
        kind: 'check',
        checkName: (raw.check_name as string) ?? 'check',
        passed: Boolean(s.check_passed),
        evidence: { detail: (s.check_evidence as string) ?? '' },
      }
    } else {
      payload = {
        kind: 'model_thinking',
        text:
          (raw.text as string) ??
          (raw.message as string) ??
          (raw.summary as string) ??
          (s.gating_reason as string) ??
          `${s.kind ?? 'step'}`,
      }
    }
    return {
      id: s.id as string,
      runId: s.agent_run_id as string,
      stepIndex: (s.step_number as number) ?? 0,
      kind,
      payload,
      createdAt: (s.created_at as string) ?? new Date().toISOString(),
    }
  })
  return c.json({ steps })
})

// ─── GET /:id/needs — connection + browser-login needs ───────────────────────
//  (getRunConnectionNeeds + getRunBrowserLoginNeeds)

async function runConnectionNeeds(ws: string, runId: string): Promise<string[]> {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from('cloud_activity')
    .select('activity_type,payload')
    .eq('agent_run_id', runId)
    .eq('workspace_id', ws)
    .in('activity_type', ['connection_expired', 'composio_resolved'])
    .limit(500)

  const slugs = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === 'string') {
      const slug = value.trim().toLowerCase()
      if (slug) slugs.add(slug)
    }
  }

  for (const row of data ?? []) {
    const type = (row.activity_type as string) ?? ''
    const payload = (row.payload ?? {}) as Record<string, unknown>

    if (type === 'connection_expired') {
      // Primary signal: camelCase `toolkitSlug`. Tolerate the snake_case /
      // bare `toolkit` shapes the prompt mentioned in case the worker changes.
      add(payload.toolkitSlug ?? payload.toolkit_slug ?? payload.toolkit)
      continue
    }

    // composio_resolved — only a "need" when explicitly flagged missing.
    if (payload.missing) add(payload.toolkitSlug ?? payload.toolkit_slug ?? payload.toolkit)
    const missingList = payload.missingToolkitSlugs
    if (Array.isArray(missingList)) for (const s of missingList) add(s)
  }

  return [...slugs]
}

async function runBrowserLoginNeeds(ws: string, runId: string): Promise<string[]> {
  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from('cloud_activity')
    .select('payload,workspace_id')
    .eq('agent_run_id', runId)
    .eq('workspace_id', ws)
    .eq('activity_type', 'browser_login_required')
    .limit(200)

  const hosts = new Set<string>()
  let workspaceId: string | undefined
  for (const row of data ?? []) {
    workspaceId = (row.workspace_id as string) ?? workspaceId
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const host =
      typeof payload.host === 'string'
        ? payload.host.trim().toLowerCase().replace(/^www\./, '')
        : ''
    if (host) hosts.add(host)
  }
  if (hosts.size === 0) return []

  // Drop hosts already connected so the banner disappears once fixed.
  if (workspaceId) {
    const { data: saved } = await supabase
      .from('workspace_browser_sites')
      .select('host')
      .eq('workspace_id', workspaceId)
      .gt('expires_at', new Date().toISOString())
    for (const s of saved ?? [])
      hosts.delete(((s.host as string) ?? '').toLowerCase().replace(/^www\./, ''))
  }
  return [...hosts]
}

runViewsRoute.get('/:id/needs', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const runId = c.req.param('id')
  const [connectionNeeds, browserLoginNeeds] = await Promise.all([
    runConnectionNeeds(ws, runId),
    runBrowserLoginNeeds(ws, runId),
  ])
  return c.json({ connectionNeeds, browserLoginNeeds })
})

// ─── GET /:id/live-view — active tab live-view URL (getActiveLiveView) ────────
//
// CRITICAL: resolves the live-view URL via the Browserbase debug API using the
// server-side BROWSERBASE_API_KEY (from config — NEVER returned to the client).
// Only the resolved liveViewUrl goes back. This is the whole point of moving it
// off the renderer.

runViewsRoute.get('/:id/live-view', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const runId = c.req.param('id')
  const supabase = supabaseAdmin()

  const { data: run } = await supabase
    .from('cloud_runs')
    .select('browserbase_session_id')
    .eq('id', runId)
    .eq('workspace_id', ws)
    .maybeSingle()
  const sid = (run?.browserbase_session_id as string | undefined) ?? undefined
  const key = getConfig().BROWSERBASE_API_KEY
  if (!sid || !key) return c.json({ liveViewUrl: null })
  try {
    const res = await fetch(`https://api.browserbase.com/v1/sessions/${sid}/debug`, {
      headers: { 'X-BB-API-Key': key },
      cache: 'no-store',
    })
    if (!res.ok) return c.json({ liveViewUrl: null })
    const json = (await res.json()) as {
      debuggerFullscreenUrl?: string
      pages?: Array<{ url?: string; debuggerFullscreenUrl?: string; debuggerUrl?: string }>
    }
    const pages = json.pages ?? []
    // Prefer the last non-about:blank page — that's the tab the agent is on.
    const real = [...pages].reverse().find((p) => p.url && !p.url.startsWith('about:'))
    const pick = real ?? pages[pages.length - 1]
    const liveViewUrl =
      pick?.debuggerFullscreenUrl ?? pick?.debuggerUrl ?? json.debuggerFullscreenUrl ?? null
    return c.json({ liveViewUrl })
  } catch {
    return c.json({ liveViewUrl: null })
  }
})
