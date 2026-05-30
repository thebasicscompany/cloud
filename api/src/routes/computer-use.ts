import type Anthropic from '@anthropic-ai/sdk'
import { Hono } from 'hono'
import { z } from 'zod'

import { getAnthropicClient, runMessages, COMPUTER_USE_MODEL } from '../lib/anthropic.js'
import { recordUsage } from '../lib/usage-meter.js'
import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'
import { logger } from '../middleware/logger.js'

/**
 * Computer-use BRAIN — one step of a local computer-use run. The desktop owns
 * the eyes (screen capture) and hands (input injection); this endpoint is the
 * pluggable brain: given the goal + the running conversation (with the latest
 * screenshot), it returns the next normalized action(s) for the desktop to
 * execute. Today the brain is Claude computer-use; an Agent-S3 / open-model
 * harness can replace THIS endpoint without touching the desktop loop.
 *
 * Stateless: the desktop holds the conversation and posts it each step.
 */

type Vars = { requestId: string; workspace: WorkspaceToken }

export const computerUseRoute = new Hono<{ Variables: Vars }>()

// In-stack harness prompt — tuned for SPEED. Each turn is a model call, so the
// cost is the number of turns: prefer the keyboard, type whole strings in one
// action, batch predictable sequences, and don't take redundant screenshots.
const SYSTEM = `You operate the user's own computer to complete a task. You get a screenshot (WxH pixels) each turn and act via the computer tool. BE FAST — every turn is expensive, so minimize turns.

Speed rules (most important):
- Prefer the KEYBOARD over the mouse. Type a WHOLE string or expression in ONE 'type' action — e.g. type "25*4=" in a calculator, never click buttons one at a time. Use shortcuts (Enter, Ctrl+C, Ctrl+L for an address bar, etc.).
- To OPEN an app: {APP_OPEN}. Don't hunt for taskbar icons. After opening the launcher, WAIT a beat for it to appear before typing.
- BATCH obvious steps: when the outcome is predictable you may issue several actions in one turn. Only screenshot-and-check after something genuinely uncertain.
- Don't take a screenshot just to "look" — act, and read the result next turn.

Grounding: coordinates are in the WxH screenshot space; aim for the CENTER of a visible element. Scroll to reveal hidden things.

Reading: when the task asks you to READ or report specific information, look at the EXACT on-screen element and report the PRECISE text or value you see — verbatim — never a vague summary, count, or approximation. If small text is hard to read, look more closely (or scroll the element into clearer view) before answering; don't guess or hand-wave.

Completion: when done, STOP calling the tool and reply with a one-line result. If blocked (a login, ambiguity, or an action that keeps failing), STOP and say what's needed — don't thrash.

SAFETY: never delete files, send messages/email, post publicly, change settings destructively, or make purchases unless the task explicitly asks.`

const stepSchema = z
  .object({
    goal: z.string().max(4000).optional(),
    width: z.number().int().positive().max(4096),
    height: z.number().int().positive().max(4096),
    messages: z.array(z.any()),
    maxTokens: z.number().int().positive().max(4096).optional(),
    platform: z.string().optional(), // 'win32' | 'darwin' | 'linux' — OS-aware app launch
  })
  .passthrough()

interface ToolUseInput {
  action?: string;
  coordinate?: unknown;
  text?: string;
  scroll_direction?: string;
  scroll_amount?: number;
}

// Map a Claude `computer_20250124` tool_use input → the desktop hands' action.
function normalizeAction(input: ToolUseInput): Record<string, unknown> {
  const a = input?.action
  const coord = Array.isArray(input?.coordinate) ? (input.coordinate as number[]) : []
  const x = coord[0]
  const y = coord[1]
  switch (a) {
    case 'mouse_move': return { type: 'move', x, y }
    case 'left_click': return { type: 'click', x, y, button: 'left' }
    case 'right_click': return { type: 'click', x, y, button: 'right' }
    case 'middle_click': return { type: 'click', x, y, button: 'middle' }
    case 'double_click': return { type: 'double_click', x, y }
    case 'triple_click': return { type: 'click', x, y, button: 'left', count: 3 }
    case 'left_click_drag': return { type: 'click', x, y, button: 'left' }
    case 'type': return { type: 'type', text: input.text ?? '' }
    case 'key': return { type: 'key', key: input.text ?? '' }
    case 'scroll': return { type: 'scroll', amount: input.scroll_direction === 'up' ? (input.scroll_amount ?? 3) : -(input.scroll_amount ?? 3) }
    case 'wait': return { type: 'wait', ms: 800 }
    case 'screenshot': return { type: 'screenshot' }
    case 'cursor_position': return { type: 'noop' }
    default: return { type: 'unknown', action: a }
  }
}

computerUseRoute.post('/step', requireWorkspaceJwt, async (c) => {
  let body: z.infer<typeof stepSchema>
  try {
    body = stepSchema.parse(await c.req.json())
  } catch (err) {
    return c.json({ error: 'invalid_request', message: err instanceof Error ? err.message : 'bad body' }, 400)
  }

  const tools = [
    { type: 'computer_20250124', name: 'computer', display_width_px: body.width, display_height_px: body.height },
  ] as unknown as Anthropic.Messages.ToolUnion[]

  let msg: Anthropic.Messages.Message
  try {
    const appOpen =
      body.platform === 'darwin'
        ? `press Cmd+Space for Spotlight (key "cmd+space"), type the app name, then press Enter (key "return")`
        : body.platform === 'linux'
          ? `press the Super key (key "super"), type the app name, then press Enter (key "return")`
          : `press the Windows key (key "win"), type the app name, then press Enter (key "return")`
    msg = await runMessages({
      system: SYSTEM.replace('WxH', `${body.width}x${body.height}`).replace('{APP_OPEN}', appOpen),
      messages: body.messages as Anthropic.MessageParam[],
      tools,
      maxTokens: body.maxTokens ?? 1536, // room to observe + plan before acting
    })
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'computer-use: brain step failed')
    return c.json({ error: 'brain_unavailable', message: err instanceof Error ? err.message : 'model error' }, 502)
  }

  // Meter this call into the shared daily ledger — closes the computer-use cost
  // blind spot; the recorded cost also counts toward the workspace budget ceiling.
  const ws = c.var.workspace
  const usage = msg.usage as { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | undefined
  recordUsage({
    workspaceId: ws.workspace_id,
    accountId: ws.account_id,
    model: COMPUTER_USE_MODEL,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
  })

  const actions = msg.content
    .filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use')
    .map((t) => ({ tool_use_id: t.id, ...normalizeAction(t.input as ToolUseInput) }))
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim()

  return c.json({
    assistant: msg, // raw assistant message — the desktop appends this to history
    actions,
    text,
    done: actions.length === 0,
    stop_reason: msg.stop_reason,
  })
})

/**
 * Fast-path planner for self-learning. Given the goal + a known-good recipe +
 * the current screen, return a concrete action PLAN (params adapted to this
 * task) plus the expected end state — to be REPLAYED without per-step model
 * calls. The loop replays it, then verifies via /step (which heals on any
 * divergence). One call instead of N.
 */
computerUseRoute.post('/plan', requireWorkspaceJwt, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    goal?: string; recipe?: string; platform?: string; width?: number; height?: number; image?: string
  }
  const goal = String(body.goal ?? '')
  const recipe = String(body.recipe ?? '')
  const w = Number(body.width) || 1280
  const h = Number(body.height) || 720
  const img = String(body.image ?? '')
  if (!goal || !recipe || !img) return c.json({ error: 'goal, recipe, image required', actions: [] }, 400)

  const appOpen =
    body.platform === 'darwin' ? 'key "cmd+space" (Spotlight), type the app name, key "return"'
    : body.platform === 'linux' ? 'key "super", type the app name, key "return"'
    : 'key "win" (Start), type the app name, key "return"'
  const sys = `You convert a known-good recipe into a concrete action PLAN for a NEW task, to be REPLAYED with no further input. Output ONLY a JSON object, no prose:
{"actions":[{"type":"key","key":"win"},{"type":"type","text":"calculator"},{"type":"key","key":"return"},{"type":"type","text":"18*7="}],"expected":"one line: what the screen shows when the task is done"}
Action types: {"type":"key","key":"..."} | {"type":"type","text":"..."} | {"type":"click","x":<int>,"y":<int>} | {"type":"double_click","x":..,"y":..} | {"type":"scroll","amount":<int>} | {"type":"wait","ms":<int>}. Coordinates are in the ${w}x${h} screenshot space. To open an app: ${appOpen}. ADAPT the recipe's specifics (numbers, text, targets) to THIS task. Include ONLY the steps needed; no extras.`
  const userMsg = `New task: ${goal}\n\nRecipe that worked for a similar task:\n${recipe}\n\nThe current screen is attached (${w}x${h}). Produce the action plan + expected end state.`

  try {
    const client = getAnthropicClient()
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 800,
      system: sys,
      messages: [{ role: 'user', content: [{ type: 'text', text: userMsg }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } }] }],
    })
    const text = msg.content.map((b: Anthropic.Messages.ContentBlock) => (b.type === 'text' ? b.text : '')).join('')
    const m = text.match(/\{[\s\S]*\}/)
    const parsed = m ? (JSON.parse(m[0]) as { actions?: unknown; expected?: unknown }) : { actions: [] }
    const actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 30) : []
    return c.json({ actions, expected: String(parsed.expected ?? '') })
  } catch (err) {
    return c.json({ error: 'plan_failed', message: err instanceof Error ? err.message : 'model error', actions: [] }, 502)
  }
})

// ── Desktop computer-use QUEUE + self-learning recipe cache ────────────────
// The worker's `computer_use` tool enqueues a row in public.computer_use_requests
// for the run's workspace; the user's desktop watcher claims it here, runs the
// local eyes→brain→hands loop (calling /step above), and posts the result back.
//
// These three endpoints were previously in the Next web app, where they used the
// service-role admin client AND a CLIENT-SUPPLIED `workspaceId` from the request
// body — a cross-workspace hole (any caller could claim/resolve another
// workspace's requests, or read/poison its recipes). Here the workspace comes
// from the VERIFIED JWT (`c.var.workspace.workspace_id`), never the body, so a
// token can only ever touch its own workspace's queue and recipes.

// POST /v1/computer/next — atomically claim the oldest pending request for the
// caller's workspace (pending → running). { request: null } when idle.
computerUseRoute.post('/next', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const supabase = supabaseAdmin()

  const { data: pending } = await supabase
    .from('computer_use_requests')
    .select('id,task,run_id')
    .eq('workspace_id', ws)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!pending) return c.json({ request: null })

  // Claim only if STILL pending — avoids two desktops double-claiming.
  const { data: claimed } = await supabase
    .from('computer_use_requests')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', pending.id)
    .eq('status', 'pending')
    .select('id,task,run_id')
    .maybeSingle()
  if (!claimed) return c.json({ request: null })

  return c.json({ request: { id: claimed.id, task: claimed.task, runId: claimed.run_id } })
})

// POST /v1/computer/:id/result — desktop posts the loop outcome; flips the row
// to done/error so the worker's polling computer_use tool returns it to the agent.
computerUseRoute.post('/:id/result', requireWorkspaceJwt, async (c) => {
  const id = c.req.param('id')
  const ws = c.var.workspace.workspace_id
  const body = (await c.req.json().catch(() => ({}))) as {
    ok?: boolean; text?: string; steps?: number; error?: string
  }
  const ok = body.ok !== false && !body.error
  const result = ok
    ? { text: body.text ?? 'done', steps: body.steps ?? null }
    : { error: body.error ?? 'computer-use failed' }

  const { error } = await supabaseAdmin()
    .from('computer_use_requests')
    .update({ status: ok ? 'done' : 'error', result, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', ws) // scope to the JWT workspace — can't resolve another ws's request
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ ok: true })
})

// Recipe matching by task "shape": significant tokens, numbers/quotes stripped,
// so "compute 25*4" and "compute 17*9" share a recipe. (Ported verbatim from the
// web route — pure functions, no I/O.)
const RECIPE_STOP = new Set([
  'the', 'a', 'an', 'to', 'in', 'on', 'of', 'and', 'then', 'with', 'for', 'my', 'me', 'it',
  'this', 'that', 'use', 'using', 'please', 'app', 'desktop', 'windows', 'mac', 'report',
  'tell', 'show', 'result', 'do', 'open',
])
function recipeTokens(task: string): Set<string> {
  return new Set(
    task.toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !RECIPE_STOP.has(w)),
  )
}
function recipeSignature(task: string): string {
  return [...recipeTokens(task)].sort().join(' ')
}
function recipeJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return inter / (a.size + b.size - inter)
}
const RECIPE_MATCH_THRESHOLD = 0.6

// GET /v1/computer/recipe?task=... — best prior approach for a task shape, so the
// loop can warm-start. Scoped to the caller's workspace.
computerUseRoute.get('/recipe', requireWorkspaceJwt, async (c) => {
  const task = c.req.query('task') ?? ''
  if (!task.trim()) return c.json({ recipe: null })
  const ws = c.var.workspace.workspace_id

  const { data } = await supabaseAdmin()
    .from('computer_use_recipes')
    .select('id,signature,approach,success_count')
    .eq('workspace_id', ws)
    .order('last_used_at', { ascending: false })
    .limit(50)

  const taskTokens = recipeTokens(task)
  let best: { approach: string; successCount: number; sim: number } | null = null
  for (const r of (data ?? []) as Array<{ signature: string; approach: string; success_count: number }>) {
    const sim = recipeJaccard(taskTokens, new Set(r.signature.split(' ').filter(Boolean)))
    if (sim >= RECIPE_MATCH_THRESHOLD && (!best || sim > best.sim)) {
      best = { approach: r.approach, successCount: r.success_count, sim }
    }
  }
  return c.json({ recipe: best ? { approach: best.approach, successCount: best.successCount } : null })
})

// POST /v1/computer/recipe — save the approach that worked. Upsert on (ws, shape).
computerUseRoute.post('/recipe', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const body = (await c.req.json().catch(() => ({}))) as {
    task?: unknown; approach?: unknown; title?: unknown; app?: unknown
  }
  const task = typeof body.task === 'string' ? body.task.trim() : ''
  const approach = typeof body.approach === 'string' ? body.approach.trim() : ''
  if (!task || !approach) return c.json({ ok: false, error: 'task + approach required' }, 400)
  const sig = recipeSignature(task)
  if (!sig) return c.json({ ok: false, error: 'no signature' }, 400)

  const supabase = supabaseAdmin()
  const { data: existing } = await supabase
    .from('computer_use_recipes')
    .select('id,success_count')
    .eq('workspace_id', ws)
    .eq('signature', sig)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('computer_use_recipes')
      .update({
        approach: approach.slice(0, 2000),
        success_count: ((existing.success_count as number | null) ?? 1) + 1,
        last_used_at: new Date().toISOString(),
        ...(typeof body.title === 'string' ? { title: body.title.slice(0, 160) } : {}),
        ...(typeof body.app === 'string' ? { app_hint: body.app.slice(0, 120) } : {}),
      })
      .eq('id', existing.id)
  } else {
    await supabase.from('computer_use_recipes').insert({
      workspace_id: ws,
      signature: sig,
      title: typeof body.title === 'string' ? body.title.slice(0, 160) : '',
      approach: approach.slice(0, 2000),
      app_hint: typeof body.app === 'string' ? body.app.slice(0, 120) : null,
    })
  }
  return c.json({ ok: true })
})

// Hybrid grounding/reason/bench endpoints (UI-TARS A/B experiment) were removed
// 2026-05-30 — Claude-native /step won the eval and is the production harness.
