import { randomUUID } from 'node:crypto'

import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

/**
 * Workspace documents — long-form artifacts (reports, plans, drafts) the agent
 * + automations write and the user reviews (distinct from Apps = record
 * collections).
 *
 * Ported from the web data lib `web/src/lib/documents-data.ts`, but scoped to
 * the VERIFIED workspace JWT (`c.var.workspace.workspace_id`) instead of a
 * service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID. Each token only
 * ever reads its own workspace's documents — so this can power the renderer
 * directly (no admin key on the client, no cross-workspace leak).
 *
 *   GET    /v1/documents              → { documents: DocSummary[] }
 *   GET    /v1/documents?runId=<uuid> → outputs a specific run produced
 *   GET    /v1/documents/:slug        → { document: DocDetail | null }
 *   POST   /v1/documents              → create a document
 *   PATCH  /v1/documents/:slug        → edit a document (title/summary/body/status/pinned)
 *   DELETE /v1/documents/:slug        → archive (soft-delete) a document
 *
 * The write handlers are ported VERBATIM from the web mutation routes
 * (`web/src/app/api/documents/...`), swapping the hardcoded PRIMARY_WORKSPACE_ID
 * for the verified `c.var.workspace.workspace_id`.
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const documentsRoute = new Hono<{ Variables: Vars }>()

interface DocRow {
  id: string
  slug: string
  title: string
  summary: string | null
  icon: string | null
  status: string | null
  pinned: boolean | null
  body?: string | null
  actions?: unknown
  source_run_id: string | null
  source_automation_id: string | null
  updated_at: string
}

const SUMMARY_COLS =
  'id,slug,title,summary,icon,status,pinned,source_run_id,source_automation_id,updated_at'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Resolve source automation names — scoped to the same workspace for safety. */
async function resolveAutomationNames(ws: string, rows: DocRow[]): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(rows.map((r) => r.source_automation_id).filter(Boolean) as string[]),
  )
  const names = new Map<string, string>()
  if (ids.length === 0) return names
  const { data } = await supabaseAdmin()
    .from('automations')
    .select('id,name')
    .eq('workspace_id', ws)
    .in('id', ids)
  for (const a of data ?? []) names.set(a.id as string, a.name as string)
  return names
}

function sourceOf(row: DocRow, autoNames: Map<string, string>) {
  if (row.source_automation_id)
    return {
      kind: 'automation' as const,
      id: row.source_automation_id,
      label: autoNames.get(row.source_automation_id) ?? 'Automation',
    }
  if (row.source_run_id) return { kind: 'run' as const, id: row.source_run_id, label: 'Agent run' }
  return { kind: 'user' as const, id: null, label: 'Added by you' }
}

function toSummary(r: DocRow, names: Map<string, string>) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary ?? '',
    icon: r.icon ?? null,
    status: r.status ?? 'ready',
    pinned: Boolean(r.pinned),
    source: sourceOf(r, names),
    updatedAt: r.updated_at,
  }
}

documentsRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const runId = c.req.query('runId')
  const supabase = supabaseAdmin()
  let query = supabase
    .from('workspace_documents')
    .select(SUMMARY_COLS)
    .eq('workspace_id', ws)
    .neq('status', 'archived')
  query = runId
    ? query.eq('source_run_id', runId).order('updated_at', { ascending: false })
    : query.order('pinned', { ascending: false }).order('updated_at', { ascending: false })
  const { data } = await query
  const rows = (data ?? []) as DocRow[]
  const names = await resolveAutomationNames(ws, rows)
  return c.json({ documents: rows.map((r) => toSummary(r, names)) })
})

documentsRoute.get('/:slug', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const slug = c.req.param('slug')
  const { data } = await supabaseAdmin()
    .from('workspace_documents')
    .select(`${SUMMARY_COLS},body,actions`)
    .eq('workspace_id', ws)
    .eq('slug', slug)
    .maybeSingle()
  if (!data) return c.json({ document: null }, 404)
  const row = data as DocRow
  const names = await resolveAutomationNames(ws, [row])
  return c.json({
    document: {
      ...toSummary(row, names),
      body: (row.body as string) ?? '',
      actions: Array.isArray(row.actions) ? row.actions : [],
    },
  })
})

/**
 * POST / — create a document. Used by the user's "New document" flow and by
 * agents. Ported verbatim from web `api/documents/route.ts` POST.
 */
documentsRoute.post('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  let body: {
    title?: unknown
    slug?: unknown
    summary?: unknown
    icon?: unknown
    body?: unknown
    sourceRunId?: unknown
  } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    // tolerate empty body
  }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return c.json({ error: 'A title is required.' }, 400)
  const slug =
    typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(title)
  if (!slug) return c.json({ error: 'Could not derive a slug.' }, 400)

  const { data, error } = await supabaseAdmin()
    .from('workspace_documents')
    .insert({
      workspace_id: ws,
      slug,
      title,
      summary: typeof body.summary === 'string' ? body.summary : '',
      icon: typeof body.icon === 'string' ? body.icon : 'document',
      body: typeof body.body === 'string' ? body.body : '',
      status: 'draft',
      ...(typeof body.sourceRunId === 'string' && body.sourceRunId
        ? { source_run_id: body.sourceRunId }
        : {}),
    })
    .select('id,slug')
    .maybeSingle()
  if (error) {
    const conflict = error.code === '23505'
    return c.json(
      { error: conflict ? `A document "${slug}" already exists.` : error.message },
      conflict ? 409 : 500,
    )
  }
  return c.json({ ok: true, id: data?.id, slug: data?.slug ?? slug })
})

/**
 * POST /recorded-routine — bundle a recorded routine (spoken narration + the
 * screenshots the user demonstrated) into a durable Document plus a prompt that
 * drives the agent to build + run an automation from the demonstration.
 *
 * Ported verbatim from web `api/routines/record/route.ts`, swapping the
 * hardcoded PRIMARY_WORKSPACE_ID for the verified `c.var.workspace.workspace_id`.
 * Screenshots are uploaded to the public `routine-captures` bucket so both the
 * user (in Documents) and the cloud agent (which opens the URLs) can see what
 * was demonstrated.
 *
 * NOTE: mounted before `POST /` and `PATCH /:slug` is irrelevant (distinct
 * path); registered here for cohesion since it writes `workspace_documents`.
 */
const ROUTINE_BUCKET = 'routine-captures'
const ROUTINE_MAX_SHOTS = 8

documentsRoute.post('/recorded-routine', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  let body: { narration?: unknown; screenshots?: unknown; minutes?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    /* tolerate */
  }
  const narration = typeof body.narration === 'string' ? body.narration.trim() : ''
  const shots = Array.isArray(body.screenshots)
    ? (body.screenshots.filter((s) => typeof s === 'string') as string[]).slice(0, ROUTINE_MAX_SHOTS)
    : []

  const supabase = supabaseAdmin()
  const id = randomUUID().slice(0, 8)

  // Upload the screenshots → public URLs.
  const urls: string[] = []
  for (let i = 0; i < shots.length; i++) {
    const m = /^data:image\/(jpeg|jpg|png);base64,(.+)$/.exec(shots[i]!)
    if (!m) continue
    const ext = m[1] === 'png' ? 'png' : 'jpg'
    const buf = Buffer.from(m[2]!, 'base64')
    const path = `${ws}/${id}/step-${String(i + 1).padStart(2, '0')}.${ext}`
    const up = await supabase.storage
      .from(ROUTINE_BUCKET)
      .upload(path, buf, { contentType: `image/${ext === 'jpg' ? 'jpeg' : 'png'}`, upsert: true })
    if (!up.error) {
      const { data } = supabase.storage.from(ROUTINE_BUCKET).getPublicUrl(path)
      if (data?.publicUrl) urls.push(data.publicUrl)
    }
  }

  // Durable Document: narration + the demonstrated screenshots.
  const shotsMd = urls.length
    ? urls.map((u, i) => `### Step ${i + 1}\n\n![Step ${i + 1}](${u})`).join('\n\n')
    : '_(no screenshots captured)_'
  const docBody = `# Recorded routine\n\nA workflow demonstrated with narration + screenshots, to turn into an automation.\n\n## What I said while doing it\n\n${narration || '_(no narration captured)_'}\n\n## What I showed\n\n${shotsMd}\n`
  const slug = `recorded-routine-${id}`
  await supabase
    .from('workspace_documents')
    .insert({
      workspace_id: ws,
      slug,
      title: 'Recorded routine',
      summary: (narration || 'A recorded routine to turn into an automation.').slice(0, 160),
      icon: 'document',
      body: docBody,
      status: 'ready',
    })
    .select('slug')
    .maybeSingle()

  // The prompt: narration + the screenshot URLs the agent can open to SEE the
  // demonstration, then build + run the automation.
  const shotList = urls.length
    ? `\n\nI also took ${urls.length} screenshots of exactly what I did — open each to see the steps:\n${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
    : ''
  const prompt = `Build a reusable automation from a routine I just recorded, then run it.

What I said while demonstrating it:
${narration || '(no narration captured)'}${shotList}

Use the narration and the screenshots (open the URLs in your browser to view them) to reproduce this exact workflow as an automation. Save it, then run it once to confirm it works.`

  return c.json({ ok: true, slug, prompt, screenshots: urls.length })
})

/**
 * PATCH /:slug — edit a document (user). Ported verbatim from web
 * `api/documents/[slug]/route.ts` PATCH. Also covers pin/unpin (`pinned`).
 */
documentsRoute.patch('/:slug', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const slug = c.req.param('slug')
  let body: {
    title?: unknown
    summary?: unknown
    body?: unknown
    status?: unknown
    pinned?: unknown
  } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    // tolerate empty body
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.summary === 'string') patch.summary = body.summary
  if (typeof body.body === 'string') patch.body = body.body
  if (typeof body.status === 'string') patch.status = body.status
  if (typeof body.pinned === 'boolean') patch.pinned = body.pinned

  const { error } = await supabaseAdmin()
    .from('workspace_documents')
    .update(patch)
    .eq('workspace_id', ws)
    .eq('slug', slug)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ ok: true })
})

/**
 * DELETE /:slug — archive (soft-delete) a document (user). Ported verbatim from
 * web `api/documents/[slug]/route.ts` DELETE.
 */
documentsRoute.delete('/:slug', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const slug = c.req.param('slug')
  const { error } = await supabaseAdmin()
    .from('workspace_documents')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('workspace_id', ws)
    .eq('slug', slug)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ ok: true })
})
