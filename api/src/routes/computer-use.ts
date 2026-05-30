import type Anthropic from '@anthropic-ai/sdk'
import { Hono } from 'hono'
import { z } from 'zod'

import { getAnthropicClient, runMessages } from '../lib/anthropic.js'
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

/**
 * Flexible grounding — Claude Sonnet 4.5 returns the pixel coords of an
 * arbitrary target on a screenshot. Used to fairly compare Claude grounding vs
 * UI-TARS on identical targets. POST { image, width, height, target }.
 */
computerUseRoute.post('/ground', requireWorkspaceJwt, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { image?: string; width?: number; height?: number; target?: string }
  const img = String(body.image ?? '')
  const w = Number(body.width) || 1280
  const h = Number(body.height) || 720
  const target = String(body.target ?? '').slice(0, 300)
  if (!img || !target) return c.json({ error: 'image + target required' }, 400)
  const prompt = `This is a ${w}x${h} pixel screenshot. Reply with ONLY a JSON object {"x":<int>,"y":<int>} = the pixel coordinates of the CENTER of this exact element: ${target}. No other text.`
  try {
    const client = getAnthropicClient()
    const t0 = Date.now()
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } }] }],
    })
    const text = msg.content.map((b: Anthropic.Messages.ContentBlock) => (b.type === 'text' ? b.text : '')).join('')
    const m = text.match(/\{[\s\S]*?\}/)
    const xy = m ? (JSON.parse(m[0]) as { x?: number; y?: number }) : {}
    return c.json({ x: xy.x ?? null, y: xy.y ?? null, ms: Date.now() - t0, raw: text.slice(0, 80) })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message.slice(0, 100) : 'model error' }, 502)
  }
})

/**
 * Speed benchmark — same screenshot + grounding task to Claude Sonnet 4.5 (the
 * current computer-use brain) and Gemini 3.5 Flash. Returns each model's latency
 * + answer so we can decide whether a faster brain is worth swapping in. Keys
 * stay server-side. POST { image: base64Jpeg, width, height }.
 */
computerUseRoute.post('/bench', requireWorkspaceJwt, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { image?: string; width?: number; height?: number }
  const img = String(body.image ?? '')
  const w = Number(body.width) || 1280
  const h = Number(body.height) || 720
  if (!img) return c.json({ error: 'image (base64 jpeg) required' }, 400)
  const prompt = `This is a ${w}x${h} pixel screenshot of a Windows desktop. Reply with ONLY a JSON object {"x":<int>,"y":<int>} giving the pixel coordinates of the CENTER of the Windows Start button in the taskbar. No other text.`

  let claude: { ms: number; text: string } = { ms: 0, text: '' }
  try {
    const client = getAnthropicClient()
    const t0 = Date.now()
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img } }] }],
    })
    claude = { ms: Date.now() - t0, text: msg.content.map((b: Anthropic.Messages.ContentBlock) => (b.type === 'text' ? b.text : '')).join('').slice(0, 120) }
  } catch (err) {
    claude = { ms: 0, text: `ERR ${err instanceof Error ? err.message.slice(0, 90) : ''}` }
  }

  let gemini: { ms: number; text: string; model: string } = { ms: 0, text: '', model: '' }
  try {
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    for (const model of ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-flash-latest']) {
      try {
        const t0 = Date.now()
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: img } }] }],
        })
        gemini = { ms: Date.now() - t0, text: String(res.text ?? '').slice(0, 120), model }
        break
      } catch (e) {
        gemini = { ms: 0, text: `ERR ${e instanceof Error ? e.message.slice(0, 90) : ''}`, model }
      }
    }
  } catch (err) {
    gemini = { ms: 0, text: `ERR ${err instanceof Error ? err.message.slice(0, 90) : ''}`, model: '' }
  }

  return c.json({ claude, gemini })
})
