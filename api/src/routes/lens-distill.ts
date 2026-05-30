import { Hono } from 'hono'
import { z } from 'zod'

import { getAnthropicClient } from '../lib/anthropic.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'
import { logger } from '../middleware/logger.js'

/**
 * Lens distillation — tier 1 of pattern recognition. The desktop points the lens
 * daemon's CADENCE_DISTILL_URL at `/v1/lens/distill`; the daemon reads the raw
 * events locally (they never leave the device raw) and POSTs only the condensed
 * event stream here, with the workspace JWT as bearer, once per ~15-min window.
 *
 * We do NOT make a suggestion here — a single window can't tell whether a task
 * RECURS. Instead one cheap model call reduces the window to a normalized intent
 * label ("Check YouTube subscriptions feed") + a runnable prompt, which we store
 * as a `lens_observations` row. Tier 2 (the web recurrence pass, shared with run
 * history) clusters those labels over a long horizon — an intent seen across
 * enough distinct windows becomes a suggestion. No embeddings: the model does
 * the semantic normalization here; clustering is plain string math downstream.
 *
 * We return the daemon's expected `DistillResponse` shape either way so its
 * local session status settles to ready.
 */

type Vars = { requestId: string; workspace: WorkspaceToken }

export const lensDistillRoute = new Hono<{ Variables: Vars }>()

// Cheap classifier for frequent background windows. Falls back gracefully if
// the model id isn't available on the key (records nothing).
const DISTILL_MODEL = 'claude-haiku-4-5-20251001'
// Floor to RECORD an observation. Deliberately low — recording is not
// suggesting; the recurrence pass (tier 2) is the real filter, so we want to
// remember any plausible task and let recurrence decide what's worth surfacing.
const MIN_OBSERVE_SCORE = 35
const MAX_EVENTS = 240

const distillRequest = z
  .object({
    session_id: z.string(),
    user_id: z.string().nullish(),
    ts_start: z.string().optional(),
    ts_end: z.string().optional(),
    events: z.array(z.any()).default([]),
    user_role: z.string().optional(),
  })
  .passthrough()

interface WireLike {
  app_name?: unknown;
  window_name?: unknown;
  browser_url?: unknown;
  text_content?: unknown;
  element_name?: unknown;
  event_type?: unknown;
  kind?: unknown;
}

function durationSec(a?: string, b?: string): number {
  if (!a || !b) return 0
  const ms = Date.parse(b) - Date.parse(a)
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

// Condense raw events into a compact activity log the classifier can read.
function condense(events: WireLike[]): { log: string; apps: string[]; urls: string[] } {
  const apps = new Set<string>()
  const urls = new Set<string>()
  const lines: string[] = []
  let lastApp = ''
  for (const e of events.slice(0, MAX_EVENTS)) {
    const app = (str(e.app_name) || str(e.window_name)).trim()
    if (app) apps.add(app)
    const url = str(e.browser_url).trim()
    if (url) urls.add(url.slice(0, 200))
    const txt = (str(e.text_content) || str(e.element_name)).replace(/\s+/g, ' ').trim().slice(0, 120)
    const ev = (str(e.event_type) || str(e.kind)).trim()
    if (app && app !== lastApp) {
      lines.push(`\n[${app}]`)
      lastApp = app
    }
    const bits = [url ? `→ ${url.slice(0, 120)}` : '', txt ? `"${txt}"` : '', ev && ev !== 'accessibility' ? `(${ev})` : '']
      .filter(Boolean)
      .join(' ')
    if (bits) lines.push(`  ${bits}`)
  }
  return { log: lines.join('\n').slice(0, 8000), apps: [...apps].slice(0, 20), urls: [...urls].slice(0, 40) }
}

const SYSTEM = `You analyze a short window of a user's on-screen activity (apps, URLs, on-screen text) captured on their own device. Decide whether it shows a REPETITIVE, well-defined task that could be turned into an automation the user would value — e.g. checking a feed, compiling a report, copying data between tools, triaging email. Ignore idle browsing, one-off navigation, entertainment, settings fiddling, or anything ambiguous.

Respond with ONLY a JSON object, no prose, no code fences:
{"is_candidate": boolean, "score": 0-100, "intent": "<one-line label>", "title": "<short imperative title, e.g. 'Summarize my unread Slack DMs'>", "rationale": "<one sentence describing what you noticed>", "suggested_prompt": "<a clear instruction an agent could run to perform this task>"}
If it is not a clear automatable task, set is_candidate=false with a low score; the other fields may be empty.`

interface Classification {
  is_candidate?: boolean;
  score?: number;
  intent?: string;
  title?: string;
  rationale?: string;
  suggested_prompt?: string;
}

lensDistillRoute.post('/distill', requireWorkspaceJwt, async (c) => {
  const workspaceId = c.var.workspace.workspace_id

  let body: z.infer<typeof distillRequest>
  try {
    body = distillRequest.parse(await c.req.json())
  } catch (err) {
    return c.json({ error: 'invalid_request', message: err instanceof Error ? err.message : 'bad body' }, 400)
  }

  const sessionId = body.session_id
  const dur = durationSec(body.ts_start, body.ts_end)
  const events = (body.events ?? []) as WireLike[]
  const { log, apps, urls } = condense(events)

  // Valid DistillResponse the daemon can deserialize (all fields required).
  const response = (score: number, keep: boolean, intent: string) => ({
    session_id: sessionId,
    intent,
    steps: [] as unknown[],
    parameters: [] as unknown[],
    app_surface: apps.map((a) => ({ app: a })),
    trigger: {},
    success_signals: {},
    determinism: 0,
    automation_candidate_score: score,
    keep,
    duration_sec: dur,
    model: DISTILL_MODEL,
  })

  // Too little signal → idle window, no candidate.
  if (events.length < 6 || log.trim().length < 40) {
    return c.json(response(0, false, 'idle'))
  }

  let parsed: Classification = {}
  try {
    const client = getAnthropicClient()
    const msg = await client.messages.create({
      model: DISTILL_MODEL,
      max_tokens: 600,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Apps: ${apps.join(', ')}\nURLs: ${urls.slice(0, 15).join(', ')}\n\nActivity log:\n${log}`,
        },
      ],
    })
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const m = text.match(/\{[\s\S]*\}/)
    if (m) parsed = JSON.parse(m[0]) as Classification
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'lens distill: classifier unavailable')
    return c.json(response(0, false, 'unknown'))
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
  const title = str(parsed.title).trim().slice(0, 120)
  const suggestedPrompt = str(parsed.suggested_prompt).trim()
  const intent = (str(parsed.intent) || title || 'workflow').slice(0, 200)
  // "Has a task" → worth REMEMBERING (an observation). Whether it becomes a
  // suggestion is decided later by recurrence, not here.
  const hasTask = Boolean(parsed.is_candidate) && score >= MIN_OBSERVE_SCORE && title.length > 0 && suggestedPrompt.length > 0

  if (hasTask) {
    try {
      const supabase = supabaseAdmin()
      await supabase.from('lens_observations').insert({
        workspace_id: workspaceId,
        intent,
        title,
        suggested_prompt: suggestedPrompt.slice(0, 2000),
        apps,
        score,
        session_id: sessionId,
      })
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'lens distill: observation insert failed')
    }
  }

  return c.json(response(score, hasTask, intent))
})

/**
 * Tolerant no-op for the daemon's post-distill forward (CADENCE_AGENT_URL →
 * POST /v1/memory/sessions). Candidates are already written at distill time, so
 * this exists only to keep the daemon's local session status = ready.
 */
export const lensMemoryRoute = new Hono<{ Variables: Vars }>()
lensMemoryRoute.post('/sessions', requireWorkspaceJwt, async (c) => {
  return c.json({ ok: true })
})
