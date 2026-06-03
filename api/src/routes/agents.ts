/**
 * Workspace-scoped named agents.
 *
 *   GET    /v1/agents          — list (newest first)
 *   POST   /v1/agents          — create
 *   GET    /v1/agents/:id      — fetch one
 *   PATCH  /v1/agents/:id      — partial update
 *   DELETE /v1/agents/:id      — hard delete
 *   POST   /v1/agents/draft    — Chief-of-Staff drafting helper (Claude-backed)
 *   POST   /v1/agents/:id/run  — dispatch a one-shot run with this agent's config
 *
 * All routes require workspace JWT (mounted at /v1/agents in app.ts).
 *
 * Schedule handling: when `schedule.enabled` is true on create/update we
 * mirror the agent into `public.automations` (the existing trigger
 * registration / dispatcher path) and store the resulting automation id
 * on the agent row. Schedule disabled / cleared → delete the linked
 * automation. Automation-side ops are best-effort: failures surface as a
 * `scheduleWarning` on the response but never block the agent op.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '../db/index.js'
import { getAnthropicClient } from '../lib/anthropic.js'
import { loadConnectedAccountByToolkit } from '../lib/automation-trigger-registry.js'
import { dispatchCloudRun, UUID_RE } from '../lib/cloud-run-dispatch.js'
import { PlanLimitError, planLimits } from '../lib/plan-limits.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { logger } from '../middleware/logger.js'
import { requireRole } from '../middleware/role.js'
import type { WorkspaceToken } from '../lib/jwt.js'

type Vars = { requestId: string; workspace?: WorkspaceToken }

export const agentsRoute = new Hono<{ Variables: Vars }>()

const DRAFT_MODEL = 'claude-sonnet-4-5'

const TargetEnum = z.enum(['cloud', 'computer', 'chrome'])
const ToolModeEnum = z.enum(['api', 'browser', 'both'])
const ToolSchema = z.object({
  tool: z.string().min(1).max(120),
  mode: ToolModeEnum,
})
const ToolsArray = z.array(ToolSchema).max(64)
const ScheduleSchema = z
  .object({
    cron: z.string().min(1).max(120),
    enabled: z.boolean(),
  })
  .nullable()

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  avatar: z.string().max(120).nullable().optional(),
  instructions: z.string().min(1).max(64 * 1024),
  target: TargetEnum,
  tools: ToolsArray.default([]),
  schedule: ScheduleSchema.optional(),
})

const UpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    avatar: z.string().max(120).nullable().optional(),
    instructions: z.string().min(1).max(64 * 1024).optional(),
    target: TargetEnum.optional(),
    tools: ToolsArray.optional(),
    schedule: ScheduleSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'at least one field required')

interface AgentRow {
  id: string
  workspace_id: string
  account_id: string
  name: string
  description: string | null
  avatar: string | null
  instructions: string
  target: string
  tools: unknown
  schedule: unknown
  automation_id: string | null
  created_by: string
  visibility?: string
  created_at: string
  updated_at: string
}

async function loadAgent(ws: string, id: string): Promise<AgentRow | null> {
  const rows = (await db.execute(sql`
    SELECT id, workspace_id, account_id, name, description, avatar, instructions,
           target, tools, schedule, automation_id, created_by, visibility,
           created_at::text AS created_at, updated_at::text AS updated_at
      FROM public.client_agents
     WHERE id = ${id} AND workspace_id = ${ws}
     LIMIT 1
  `)) as unknown as Array<AgentRow>
  return rows[0] ?? null
}

function publicShape(row: AgentRow): Record<string, unknown> {
  return row as unknown as Record<string, unknown>
}

// ─── schedule mirror into public.automations ─────────────────────────────
//
// Schedule-enabled agents mirror into the automations table so the existing
// cron registration (EventBridge via the trigger registry) fires them.
// All paths are best-effort — failure returns a warning string, never
// throws, so the agent CRUD always succeeds.

interface ScheduleMirrorResult {
  automationId: string | null
  warning?: string
}

async function createScheduleAutomation(input: {
  ws: string
  acc: string
  agent: AgentRow
  schedule: { cron: string; enabled: boolean }
}): Promise<ScheduleMirrorResult> {
  if (!input.schedule.enabled) return { automationId: null }
  try {
    const triggers = [
      { type: 'schedule', cron: input.schedule.cron, timezone: 'UTC' },
    ]
    const rows = (await db.execute(sql`
      INSERT INTO public.automations
        (workspace_id, name, description, goal, context, outputs, triggers,
         approval_policy, version, status, created_by)
      VALUES
        (${input.ws}, ${input.agent.name},
         ${`Schedule for agent ${input.agent.id}`},
         ${input.agent.instructions},
         ${JSON.stringify({ agent_id: input.agent.id })}::jsonb,
         '[]'::jsonb,
         ${JSON.stringify(triggers)}::jsonb,
         NULL, 1, 'draft', ${input.acc})
      RETURNING id
    `)) as unknown as Array<{ id: string }>
    return { automationId: rows[0]?.id ?? null }
  } catch (err) {
    logger.warn(
      { agentId: input.agent.id, err: (err as Error).message },
      'agents: failed to create linked automation for schedule',
    )
    return { automationId: null, warning: `schedule_automation_create_failed: ${(err as Error).message}` }
  }
}

async function deleteScheduleAutomation(
  ws: string,
  automationId: string,
): Promise<{ warning?: string }> {
  try {
    await db.execute(sql`
      DELETE FROM public.automations
       WHERE id = ${automationId} AND workspace_id = ${ws}
    `)
    return {}
  } catch (err) {
    logger.warn(
      { automationId, err: (err as Error).message },
      'agents: failed to delete linked schedule automation',
    )
    return { warning: `schedule_automation_delete_failed: ${(err as Error).message}` }
  }
}

// ─── POST /v1/agents ─────────────────────────────────────────────────────

agentsRoute.post('/', requireRole('member'), zValidator('json', CreateSchema), async (c) => {
  const ws = c.var.workspace!.workspace_id
  const acc = c.var.workspace!.account_id
  const body = c.req.valid('json')

  // PHASE-1-3 item 2: enforce maxAgents from the workspace's plan. null = no
  // limit (enterprise); otherwise count existing agents and 402 if at the cap.
  const limits = planLimits(c.var.workspace!.plan)
  if (limits.maxAgents !== null) {
    const countRows = (await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM public.client_agents WHERE workspace_id = ${ws}
    `)) as unknown as Array<{ cnt: number }>
    const existing = countRows[0]?.cnt ?? 0
    if (existing >= limits.maxAgents) {
      return c.json(
        {
          error: 'agent_limit',
          message: `Your plan allows ${limits.maxAgents} agents. Delete one or upgrade to add more.`,
          limit: limits.maxAgents,
          existing,
        },
        402,
      )
    }
  }

  const rows = (await db.execute(sql`
    INSERT INTO public.client_agents
      (workspace_id, account_id, name, description, avatar, instructions,
       target, tools, schedule, created_by)
    VALUES
      (${ws}, ${acc}, ${body.name}, ${body.description ?? null}, ${body.avatar ?? null},
       ${body.instructions}, ${body.target},
       ${JSON.stringify(body.tools)}::jsonb,
       ${body.schedule == null ? null : JSON.stringify(body.schedule)}::jsonb,
       ${acc})
    RETURNING id, workspace_id, account_id, name, description, avatar, instructions,
              target, tools, schedule, automation_id, created_by,
              created_at::text AS created_at, updated_at::text AS updated_at
  `)) as unknown as Array<AgentRow>
  const row = rows[0]!

  let scheduleWarning: string | undefined
  if (body.schedule?.enabled) {
    const mirror = await createScheduleAutomation({
      ws,
      acc,
      agent: row,
      schedule: body.schedule,
    })
    scheduleWarning = mirror.warning
    if (mirror.automationId) {
      await db.execute(sql`
        UPDATE public.client_agents
           SET automation_id = ${mirror.automationId}, updated_at = now()
         WHERE id = ${row.id} AND workspace_id = ${ws}
      `)
      row.automation_id = mirror.automationId
    }
  }

  return c.json(
    { agent: publicShape(row), ...(scheduleWarning ? { scheduleWarning } : {}) },
    201,
  )
})

// ─── GET /v1/agents ──────────────────────────────────────────────────────

agentsRoute.get(
  '/',
  zValidator(
    'query',
    z.object({
      limit: z.coerce.number().int().positive().max(200).default(50),
    }),
  ),
  async (c) => {
    const ws = c.var.workspace!.workspace_id
    const acc = c.var.workspace!.account_id
    const role = c.var.workspace!.role ?? 'member'
    const q = c.req.valid('query')
    // Visibility: shared rows visible to everyone in the workspace; private
    // rows only to creator + admin/owner. Members + viewers don't see other
    // members' private agents.
    const isPrivileged = role === 'admin' || role === 'owner'
    const rows = (await db.execute(sql`
      SELECT id, workspace_id, account_id, name, description, avatar, instructions,
             target, tools, schedule, automation_id, created_by, visibility,
             created_at::text AS created_at, updated_at::text AS updated_at
        FROM public.client_agents
       WHERE workspace_id = ${ws}
         AND (
           visibility = 'shared'
           ${isPrivileged ? sql`OR TRUE` : sql`OR created_by = ${acc}`}
         )
       ORDER BY updated_at DESC
       LIMIT ${q.limit}
    `)) as unknown as Array<AgentRow>
    return c.json({ agents: rows })
  },
)

// ─── GET /v1/agents/:id ──────────────────────────────────────────────────

agentsRoute.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (!UUID_RE.test(id)) return c.json({ error: 'invalid_id' }, 400)
  // Visibility check: private agents are only visible to their creator and
  // workspace admins/owners. Return the same 404 as "not found" so a private
  // row's existence isn't leaked to other members.
  const acc = c.var.workspace!.account_id
  const role = c.var.workspace!.role ?? 'member'
  const isPrivileged = role === 'admin' || role === 'owner'
  const ws = c.var.workspace!.workspace_id
  const row = await loadAgent(ws, id)
  if (!row) return c.json({ error: 'not_found' }, 404)
  const rowVis = (row as unknown as { visibility?: string }).visibility ?? 'shared'
  if (rowVis === 'private' && !isPrivileged && row.created_by !== acc) {
    return c.json({ error: 'not_found' }, 404)
  }
  return c.json({ agent: publicShape(row) })
})

// ─── PATCH /v1/agents/:id ────────────────────────────────────────────────

agentsRoute.patch('/:id', requireRole('member'), zValidator('json', UpdateSchema), async (c) => {
  const id = c.req.param('id')
  if (!UUID_RE.test(id)) return c.json({ error: 'invalid_id' }, 400)
  const ws = c.var.workspace!.workspace_id
  const acc = c.var.workspace!.account_id
  const prior = await loadAgent(ws, id)
  if (!prior) return c.json({ error: 'not_found' }, 404)

  const body = c.req.valid('json')

  const newName         = body.name         ?? prior.name
  const newDescription  = body.description  !== undefined ? body.description : prior.description
  const newAvatar       = body.avatar       !== undefined ? body.avatar      : prior.avatar
  const newInstructions = body.instructions ?? prior.instructions
  const newTarget       = body.target       ?? prior.target
  const newTools        = body.tools        ?? (prior.tools as unknown[])
  // schedule: undefined → keep prior; explicit null → clear
  const newSchedule =
    body.schedule === undefined
      ? (prior.schedule as { cron: string; enabled: boolean } | null)
      : body.schedule

  const rows = (await db.execute(sql`
    UPDATE public.client_agents
       SET name         = ${newName},
           description  = ${newDescription},
           avatar       = ${newAvatar},
           instructions = ${newInstructions},
           target       = ${newTarget},
           tools        = ${JSON.stringify(newTools)}::jsonb,
           schedule     = ${newSchedule == null ? null : JSON.stringify(newSchedule)}::jsonb,
           updated_at   = now()
     WHERE id = ${id} AND workspace_id = ${ws}
     RETURNING id, workspace_id, account_id, name, description, avatar, instructions,
               target, tools, schedule, automation_id, created_by,
               created_at::text AS created_at, updated_at::text AS updated_at
  `)) as unknown as Array<AgentRow>
  const updated = rows[0]!

  // Reconcile the linked automation based on the schedule transition.
  let scheduleWarning: string | undefined
  const wantsSchedule = !!(newSchedule && newSchedule.enabled)
  const hadAutomation = !!prior.automation_id
  if (wantsSchedule && !hadAutomation) {
    const mirror = await createScheduleAutomation({
      ws,
      acc,
      agent: updated,
      schedule: newSchedule!,
    })
    scheduleWarning = mirror.warning
    if (mirror.automationId) {
      await db.execute(sql`
        UPDATE public.client_agents
           SET automation_id = ${mirror.automationId}, updated_at = now()
         WHERE id = ${updated.id} AND workspace_id = ${ws}
      `)
      updated.automation_id = mirror.automationId
    }
  } else if (!wantsSchedule && hadAutomation) {
    const teardown = await deleteScheduleAutomation(ws, prior.automation_id!)
    scheduleWarning = teardown.warning
    await db.execute(sql`
      UPDATE public.client_agents
         SET automation_id = NULL, updated_at = now()
       WHERE id = ${updated.id} AND workspace_id = ${ws}
    `)
    updated.automation_id = null
  } else if (wantsSchedule && hadAutomation) {
    // Keep the existing automation row in sync with the new cron / fields.
    try {
      const triggers = [
        { type: 'schedule', cron: newSchedule!.cron, timezone: 'UTC' },
      ]
      await db.execute(sql`
        UPDATE public.automations
           SET name       = ${updated.name},
               goal       = ${updated.instructions},
               triggers   = ${JSON.stringify(triggers)}::jsonb,
               updated_at = now()
         WHERE id = ${prior.automation_id!} AND workspace_id = ${ws}
      `)
    } catch (err) {
      logger.warn(
        { agentId: id, err: (err as Error).message },
        'agents: failed to sync linked automation on patch',
      )
      scheduleWarning = `schedule_automation_sync_failed: ${(err as Error).message}`
    }
  }

  return c.json({
    agent: publicShape(updated),
    ...(scheduleWarning ? { scheduleWarning } : {}),
  })
})

// ─── DELETE /v1/agents/:id ───────────────────────────────────────────────

agentsRoute.delete('/:id', requireRole('member'), async (c) => {
  const id = c.req.param('id')
  if (!UUID_RE.test(id)) return c.json({ error: 'invalid_id' }, 400)
  const ws = c.var.workspace!.workspace_id
  const prior = await loadAgent(ws, id)
  if (!prior) return c.json({ error: 'not_found' }, 404)

  let scheduleWarning: string | undefined
  if (prior.automation_id) {
    const teardown = await deleteScheduleAutomation(ws, prior.automation_id)
    scheduleWarning = teardown.warning
  }

  await db.execute(sql`
    DELETE FROM public.client_agents
     WHERE id = ${id} AND workspace_id = ${ws}
  `)

  return c.json({ id, deleted: true, ...(scheduleWarning ? { scheduleWarning } : {}) })
})

// ─── POST /v1/agents/draft  (Basics drafting) ────────────────────────────

const DraftMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(32 * 1024),
})

const DraftPartialSchema = z
  .object({
    name: z.string().max(200).optional(),
    instructions: z.string().max(64 * 1024).optional(),
    target: TargetEnum.optional(),
    tools: ToolsArray.optional(),
  })
  .optional()

const DraftSchema = z.object({
  messages: z.array(DraftMessageSchema).min(1).max(80),
  partial: DraftPartialSchema,
})

// Allowlist of Composio toolkit slugs we ACTUALLY support (each maps to a
// real OAuth integration). Basics is only allowed to suggest from this list;
// anything else is filtered out before the response leaves this endpoint.
// Generic "browser" navigation is NOT a Composio toolkit — that's just the
// agent's built-in browser when target=cloud/chrome, no connection needed.
const ALLOWED_TOOLKITS = new Set([
  'gmail',
  'google_calendar',
  'google_sheets',
  'google_docs',
  'google_drive',
  'slack',
  'notion',
  'linear',
  'github',
  'asana',
  'trello',
  'airtable',
  'hubspot',
  'salesforce',
  'jira',
  'stripe',
  'shopify',
])

const DRAFT_SYSTEM = `You are Basics, a calm helper that walks the user through designing a new Agent — a named, reusable worker that runs on their behalf. Refer to yourself as "Basics" if you ever need to.

Your job in the conversation:
  • Ask one focused question at a time until you understand WHAT the agent should do, WHERE it runs, and WHICH tools it needs.
  • Once the picture is clear enough, draft the agent's NAME (short, human), INSTRUCTIONS (the system prompt the worker will follow — concrete steps, success criteria, edge cases), TARGET, and SUGGESTED TOOLS.
  • Keep replies short and warm. Avoid jargon.

Target choices:
  • 'cloud'    — runs in a fresh cloud browser (Browserbase). Best for tasks that don't need the user's logged-in Chrome or local apps. THIS TARGET HAS A BUILT-IN BROWSER ALREADY — do NOT suggest "browser" as a tool.
  • 'computer' — runs against the user's local desktop (macOS computer-use). Best for native apps, Finder, system-level work.
  • 'chrome'   — runs against the user's personal Chrome via the local relay. Best for tasks needing the user's logged-in browser session.

Tool catalog — the ONLY valid slugs for suggestedTools are:
  gmail, google_calendar, google_sheets, google_docs, google_drive, slack,
  notion, linear, github, asana, trello, airtable, hubspot, salesforce,
  jira, stripe, shopify
Do NOT invent slugs. Do NOT suggest "browser", "web", "search", or anything not in
this list — those capabilities are built into the target's browser already and
require no connection. If the agent doesn't need any of the listed toolkits,
return suggestedTools: [].

Browser cookies (suggestedBrowserSites) — for sites where the user's logged-in
session is required and NO Composio toolkit covers it (x.com timeline, reddit,
a paywalled news site, linkedin private feed, etc.), suggest the HOST as a
browser-cookie connection in \`suggestedBrowserSites\`. Format: bare hosts like
"x.com", "reddit.com" — no protocol, no path. Suggest a host ONLY when the task
genuinely needs the user's session for that site; don't suggest browser cookies
when a public unauthenticated read would work.

You MUST reply with a single JSON object — no markdown, no prose outside JSON. Schema:
  {
    "reply": string,                  // the next message to show the user
    "patch": {                        // suggested updates (omit fields you have nothing new for)
      "name"?: string,
      "instructions"?: string,
      "target"?: "cloud" | "computer" | "chrome",
      "suggestedTools"?: string[],          // Composio slugs from the catalog above ONLY
      "suggestedBrowserSites"?: string[]    // bare hosts (e.g. "x.com") for cookie-based sites
    },
    "complete"?: boolean              // true when the draft is ready to save
  }`

interface DraftResponse {
  reply: string
  patch: {
    name?: string
    instructions?: string
    target?: 'cloud' | 'computer' | 'chrome'
    suggestedTools?: string[]
    /**
     * Per-host browser cookie suggestions — e.g. ['x.com', 'reddit.com'].
     * Surfaced when the agent needs to act on a site that isn't a Composio
     * toolkit OR where the user's logged-in session is required (Twitter
     * timeline, private subreddit, paywalled article, etc.).
     */
    suggestedBrowserSites?: string[]
  }
  complete?: boolean
}

/**
 * Pull the workspace's live connection state so Basics drafts against what
 * the user ACTUALLY has connected (not against the static catalog). Returns
 * the connected Composio toolkit slugs and the hosts the user has saved
 * browser cookies for. Fail-soft: empty arrays on any error so the draft
 * call still succeeds (just without bias from existing connections).
 */
async function loadWorkspaceConnections(
  ws: string,
  acc: string,
): Promise<{ connectedToolkits: string[]; savedHosts: string[] }> {
  let connectedToolkits: string[] = []
  let savedHosts: string[] = []
  try {
    const byToolkit = await loadConnectedAccountByToolkit(ws, acc)
    connectedToolkits = Object.keys(byToolkit).sort()
  } catch {
    /* fail-soft */
  }
  try {
    const sb = supabaseAdmin()
    const { data } = await sb
      .from('workspace_browser_sites')
      .select('host')
      .eq('workspace_id', ws)
    savedHosts = (data ?? []).map((r) => String(r.host ?? '')).filter(Boolean).sort()
  } catch {
    /* fail-soft */
  }
  return { connectedToolkits, savedHosts }
}

function parseDraftReply(text: string): DraftResponse {
  // The model is instructed to return JSON only, but defensively extract
  // the first balanced JSON object in case it wraps in prose.
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) {
    return { reply: text.trim() || 'Sorry, could you say that again?', patch: {} }
  }
  try {
    const parsed = JSON.parse(m[0]) as Partial<DraftResponse>
    const patch = parsed.patch && typeof parsed.patch === 'object' ? { ...parsed.patch } : {}
    // Filter suggestedTools against the allowlist — Basics occasionally
    // hallucinates slugs like "browser" or "web" which aren't real Composio
    // toolkits and would prompt the user to "connect" something that doesn't
    // exist. Dropping unknown slugs here keeps the UI honest.
    if (Array.isArray(patch.suggestedTools)) {
      patch.suggestedTools = patch.suggestedTools.filter(
        (s) => typeof s === 'string' && ALLOWED_TOOLKITS.has(s),
      )
    }
    // Normalize suggestedBrowserSites — bare hosts only, lowercase, strip
    // protocol/path noise. Defensive against the model returning full URLs.
    if (Array.isArray(patch.suggestedBrowserSites)) {
      patch.suggestedBrowserSites = patch.suggestedBrowserSites
        .map((s) => String(s ?? '').trim().toLowerCase())
        .map((s) => s.replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
        .filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s))
    }
    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply : text.trim(),
      patch,
      ...(parsed.complete === true ? { complete: true } : {}),
    }
  } catch {
    return { reply: text.trim(), patch: {} }
  }
}

agentsRoute.post('/draft', zValidator('json', DraftSchema), async (c) => {
  const body = c.req.valid('json')
  const ws = c.var.workspace!.workspace_id
  const acc = c.var.workspace!.account_id

  // Pull what the user has actually connected so Basics can bias toward
  // already-connected toolkits + saved browser sessions (matches what
  // OpenCode sees at run time via composeConnectionsContext +
  // composeBrowserSitesContext). Fail-soft: empty arrays just remove the
  // bias hints from the system prompt without breaking drafting.
  const conn = await loadWorkspaceConnections(ws, acc)
  const connectionsPreamble = `\n\nWorkspace's CURRENT connections (prefer these — the user has already authorized them):
- Connected Composio toolkits: ${conn.connectedToolkits.length ? conn.connectedToolkits.join(', ') : '(none yet)'}
- Saved browser sessions (cookies): ${conn.savedHosts.length ? conn.savedHosts.join(', ') : '(none yet)'}

Bias your suggestedTools toward what's already connected. If the agent needs a tool from the catalog that ISN'T connected yet, suggest it anyway — the user can connect it from the canvas. For sites in suggestedBrowserSites, prefer hosts already in "Saved browser sessions" above; only suggest new hosts when the task truly needs them.`

  const partialPreamble = body.partial
    ? `\n\nCurrent draft state (may be empty):\n${JSON.stringify(body.partial, null, 2)}`
    : ''

  try {
    const client = getAnthropicClient()
    const msg = await client.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 1500,
      system: DRAFT_SYSTEM + connectionsPreamble + partialPreamble,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    })
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    return c.json(parseDraftReply(text))
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'agents draft: anthropic call failed',
    )
    return c.json({ error: 'draft_unavailable', message: (err as Error).message }, 503)
  }
})

// ─── POST /v1/agents/:id/run ─────────────────────────────────────────────
//
// Kicks off a one-shot run using this agent's preconfigured instructions +
// target + tools. The agent's `target` maps to dispatchCloudRun's
// browserTarget:
//   cloud    → 'cloud'         (Browserbase)
//   computer → 'local_compute' (pure local computer-use, no browser)
//   chrome   → 'local_relay'   (user's logged-in Chrome via relay)
//
// `goal` from the request is appended to the agent's instructions so the
// user can give a one-off objective on top of the standing system prompt.

const RunSchema = z.object({
  goal: z.string().min(1).max(64 * 1024),
  relaySession: z.string().optional(),
})

function targetToBrowserTarget(
  target: string,
): 'cloud' | 'local_compute' | 'local_relay' {
  switch (target) {
    case 'computer':
      return 'local_compute'
    case 'chrome':
      return 'local_relay'
    default:
      return 'cloud'
  }
}

agentsRoute.post('/:id/run', requireRole('member'), zValidator('json', RunSchema), async (c) => {
  const id = c.req.param('id')
  if (!UUID_RE.test(id)) return c.json({ error: 'invalid_id' }, 400)
  const ws = c.var.workspace!.workspace_id
  const agent = await loadAgent(ws, id)
  if (!agent) return c.json({ error: 'not_found' }, 404)

  // target=computer means macOS computer-use, which has to run locally — the
  // AWS Fargate worker has no Mac to drive. The web client routes these
  // through the desktop bridge (window.basichome.computerUseStart); refusing
  // here is a defense-in-depth in case any caller forgets.
  if (agent.target === 'computer') {
    return c.json(
      {
        error: 'computer_use_must_run_locally',
        message:
          "This agent uses your Mac (computer-use). Run it from the Basics desktop app — the cloud worker can't drive your machine.",
      },
      400,
    )
  }

  const body = c.req.valid('json')
  // composedGoal stays lean — the memory mandate (skill_write / helper_write
  // before final_answer) lives in the worker's system prompt now (composeMemoryMandateContext)
  // so it gets re-injected EVERY turn instead of just once in the user message,
  // and the user message stays focused on what THIS run should do.
  const composedGoal = `${agent.instructions}

---

Objective for this run:
${body.goal}`

  try {
    const result = await dispatchCloudRun({
      workspace: c.var.workspace!,
      goal: composedGoal,
      browserTarget: targetToBrowserTarget(agent.target),
      relaySession: body.relaySession,
      // agentKey drives the cloud_agents.agent_id row this run is attached to,
      // which the run-views layer surfaces as `workflowName` in Activity.
      // Without this, every Basics-agent's runs would all show as "ad-hoc".
      agentKey: agent.name,
      adHocDefinition: `Agent "${agent.name}" (${agent.id})`,
    })
    if (!result) return c.json({ error: 'dispatch_failed' }, 500)
    return c.json(
      {
        runId: result.runId,
        status: result.status,
        cloudAgentId: result.cloudAgentId,
        agentId: agent.id,
      },
      201,
    )
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return c.json({ error: 'plan_limit', code: err.code, message: err.message }, 402)
    }
    if (err instanceof Error && err.message === 'runs_queue_not_configured') {
      return c.json({ error: 'runs_queue_not_configured' }, 503)
    }
    // TODO: once an agents-native dispatch pathway exists (no ad-hoc cloud_agents
    // shim, native tool allowlist enforcement), swap this call out.
    throw err
  }
})

// Test-only exports.
export const _internals = {
  CreateSchema,
  UpdateSchema,
  DraftSchema,
  RunSchema,
  parseDraftReply,
  targetToBrowserTarget,
}
