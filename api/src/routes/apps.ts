import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

/**
 * Workspace apps — agent-built, workspace-private data surfaces (tables / boards
 * / lists). Runs + automations write outputs into them and read off them; the
 * user can also add/edit records directly (distinct from Documents = long-form
 * artifacts).
 *
 * Ported from the web data lib `web/src/lib/apps-data.ts`, but scoped to the
 * VERIFIED workspace JWT (`c.var.workspace.workspace_id`) instead of a
 * service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID. Each token only
 * ever reads its own workspace's apps — so this can power the renderer directly
 * (no admin key on the client, no cross-workspace leak).
 *
 *   GET    /v1/apps                        → { apps: AppSummary[] }
 *   GET    /v1/apps/:slug                  → { app: AppDetail | null }   (404 when missing)
 *   GET    /v1/apps/:slug/records          → { records: AppRecord[] }    (404 when app missing)
 *   POST   /v1/apps                        → create an app
 *   POST   /v1/apps/:slug/records          → append a record (dedup-aware)
 *   PATCH  /v1/apps/:slug/records/:recordId → edit a record's data/status
 *   DELETE /v1/apps/:slug/records/:recordId → delete a record
 *
 * The write handlers are ported VERBATIM from the web mutation routes
 * (`web/src/app/api/apps/...`), swapping the hardcoded PRIMARY_WORKSPACE_ID for
 * the verified `c.var.workspace.workspace_id`.
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const appsRoute = new Hono<{ Variables: Vars }>()

type AppKind = 'table' | 'board' | 'list'

interface AppField {
  key: string
  label: string
  type: string // text | email | number | url | date
}

interface AppView {
  groupBy?: string
  titleField?: string
  bodyField?: string
  stages?: string[]
  sort?: string
}

interface AppRecord {
  id: string
  data: Record<string, unknown>
  status: string | null
  source: { kind: 'run' | 'automation' | 'user'; id: string | null; label: string }
  createdAt: string
  updatedAt: string
}

interface AppRow {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  kind: string | null
  fields: unknown
  view: unknown
  updated_at: string
}

interface RecordRow {
  id: string
  data: unknown
  status: string | null
  source_run_id: string | null
  source_automation_id: string | null
  created_at: string
  updated_at: string
}

const APP_COLS = 'id,slug,name,description,icon,kind,fields,view,updated_at'
const RECORD_COLS =
  'id,data,status,source_run_id,source_automation_id,created_at,updated_at'

const SLUG_RE = /^[a-z0-9-]+$/
const KINDS = new Set(['table', 'board', 'list'])

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function parseFields(raw: unknown): AppField[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is AppField => Boolean(f) && typeof f === 'object')
    .map((f) => ({
      key: String((f as AppField).key ?? ''),
      label: String((f as AppField).label ?? (f as AppField).key ?? ''),
      type: String((f as AppField).type ?? 'text'),
    }))
    .filter((f) => f.key)
}

function parseView(raw: unknown): AppView {
  return raw && typeof raw === 'object' ? (raw as AppView) : {}
}

/** Resolve source automation names — scoped to the same workspace for safety. */
async function resolveAutomationNames(
  ws: string,
  rows: RecordRow[],
): Promise<Map<string, string>> {
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

function sourceOf(row: RecordRow, autoNames: Map<string, string>): AppRecord['source'] {
  if (row.source_automation_id)
    return {
      kind: 'automation',
      id: row.source_automation_id,
      label: autoNames.get(row.source_automation_id) ?? 'Automation',
    }
  if (row.source_run_id) return { kind: 'run', id: row.source_run_id, label: 'Agent run' }
  return { kind: 'user', id: null, label: 'Added by you' }
}

function toRecord(r: RecordRow, autoNames: Map<string, string>): AppRecord {
  return {
    id: r.id,
    data: (r.data as Record<string, unknown>) ?? {},
    status: r.status ?? null,
    source: sourceOf(r, autoNames),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

appsRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const supabase = supabaseAdmin()

  const { data: appsData } = await supabase
    .from('workspace_apps')
    .select(APP_COLS)
    .eq('workspace_id', ws)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  const apps = (appsData ?? []) as AppRow[]
  if (apps.length === 0) return c.json({ apps: [] })

  // Per-app record counts + latest activity (one grouped read).
  const { data: recs } = await supabase
    .from('workspace_app_records')
    .select('app_id,created_at')
    .eq('workspace_id', ws)

  const counts = new Map<string, { count: number; last: string | null }>()
  for (const r of recs ?? []) {
    const appId = r.app_id as string
    const cur = counts.get(appId) ?? { count: 0, last: null }
    cur.count += 1
    const ts = r.created_at as string
    if (!cur.last || ts > cur.last) cur.last = ts
    counts.set(appId, cur)
  }

  return c.json({
    apps: apps.map((a) => {
      const agg = counts.get(a.id) ?? { count: 0, last: null }
      return {
        id: a.id,
        slug: a.slug,
        name: a.name,
        description: a.description ?? '',
        icon: a.icon ?? null,
        kind: (a.kind ?? 'table') as AppKind,
        fields: parseFields(a.fields),
        view: parseView(a.view),
        recordCount: agg.count,
        lastActivityAt: agg.last ?? a.updated_at ?? null,
      }
    }),
  })
})

appsRoute.get('/:slug', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const slug = c.req.param('slug')
  const supabase = supabaseAdmin()

  const { data: appData } = await supabase
    .from('workspace_apps')
    .select(APP_COLS)
    .eq('workspace_id', ws)
    .eq('slug', slug)
    .maybeSingle()
  if (!appData) return c.json({ app: null }, 404)
  const app = appData as AppRow

  const { data: recsData } = await supabase
    .from('workspace_app_records')
    .select(RECORD_COLS)
    .eq('workspace_id', ws)
    .eq('app_id', app.id)
    .order('created_at', { ascending: false })
    .limit(500)

  const recs = (recsData ?? []) as RecordRow[]
  const autoNames = await resolveAutomationNames(ws, recs)
  const records = recs.map((r) => toRecord(r, autoNames))

  return c.json({
    app: {
      id: app.id,
      slug: app.slug,
      name: app.name,
      description: app.description ?? '',
      icon: app.icon ?? null,
      kind: (app.kind ?? 'table') as AppKind,
      fields: parseFields(app.fields),
      view: parseView(app.view),
      recordCount: records.length,
      lastActivityAt: records[0]?.createdAt ?? app.updated_at ?? null,
      records,
    },
  })
})

appsRoute.get('/:slug/records', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const slug = c.req.param('slug')
  const supabase = supabaseAdmin()

  const { data: appData } = await supabase
    .from('workspace_apps')
    .select('id')
    .eq('workspace_id', ws)
    .eq('slug', slug)
    .maybeSingle()
  if (!appData) return c.json({ records: null }, 404)
  const appId = appData.id as string

  const { data: recsData } = await supabase
    .from('workspace_app_records')
    .select(RECORD_COLS)
    .eq('workspace_id', ws)
    .eq('app_id', appId)
    .order('created_at', { ascending: false })
    .limit(500)

  const recs = (recsData ?? []) as RecordRow[]
  const autoNames = await resolveAutomationNames(ws, recs)
  return c.json({ records: recs.map((r) => toRecord(r, autoNames)) })
})

/**
 * POST / — create a new app (data surface). Used by the user's "New app" flow
 * and by agents. Ported verbatim from web `api/apps/route.ts` POST.
 */
appsRoute.post('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  let body: {
    name?: unknown
    slug?: unknown
    description?: unknown
    icon?: unknown
    kind?: unknown
    fields?: unknown
    view?: unknown
  } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    // tolerate empty body
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'A name is required.' }, 400)

  const slug =
    typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(name)
  if (!slug || !SLUG_RE.test(slug)) {
    return c.json({ error: 'Could not derive a valid slug from the name.' }, 400)
  }

  const kind = typeof body.kind === 'string' && KINDS.has(body.kind) ? body.kind : 'table'
  const fields: AppField[] = Array.isArray(body.fields)
    ? (body.fields as AppField[])
        .filter((f) => f && typeof f === 'object' && typeof f.key === 'string' && f.key)
        .map((f) => ({ key: f.key, label: f.label ?? f.key, type: f.type ?? 'text' }))
    : []
  const view = body.view && typeof body.view === 'object' ? body.view : {}

  const { data, error } = await supabaseAdmin()
    .from('workspace_apps')
    .insert({
      workspace_id: ws,
      slug,
      name,
      description: typeof body.description === 'string' ? body.description : '',
      icon: typeof body.icon === 'string' ? body.icon : null,
      kind,
      fields,
      view,
    })
    .select('id,slug')
    .maybeSingle()

  if (error) {
    const conflict = error.code === '23505'
    return c.json(
      { error: conflict ? `An app named "${slug}" already exists.` : error.message },
      conflict ? 409 : 500,
    )
  }

  return c.json({ ok: true, id: data?.id, slug: data?.slug ?? slug })
})

/**
 * POST /:slug/records — append a record (output) to an app. Bidirectional write
 * surface: the user's UI posts here when they add a row, and runs / automations
 * / agents post here to drop outputs into a typed app. Idempotent when a
 * `dedupKey` is supplied. Ported verbatim from web `api/apps/[slug]/records/route.ts`.
 */
appsRoute.post('/:slug/records', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const slug = c.req.param('slug')
  let body: {
    data?: unknown
    status?: unknown
    dedupKey?: unknown
    sourceRunId?: unknown
    sourceAutomationId?: unknown
  } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    // tolerate empty body
  }

  const record =
    body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : null
  if (!record) return c.json({ error: 'A `data` object is required.' }, 400)

  const supabase = supabaseAdmin()

  const { data: app } = await supabase
    .from('workspace_apps')
    .select('id')
    .eq('workspace_id', ws)
    .eq('slug', slug)
    .maybeSingle()
  if (!app) return c.json({ error: `No app "${slug}" in this workspace.` }, 404)

  const row = {
    app_id: app.id as string,
    workspace_id: ws,
    data: record,
    status: typeof body.status === 'string' ? body.status : null,
    dedup_key: typeof body.dedupKey === 'string' ? body.dedupKey : null,
    source_run_id: typeof body.sourceRunId === 'string' ? body.sourceRunId : null,
    source_automation_id: typeof body.sourceAutomationId === 'string' ? body.sourceAutomationId : null,
  }

  // Upsert on (app_id, dedup_key) when a dedup key is provided, else plain insert.
  const query = row.dedup_key
    ? supabase
        .from('workspace_app_records')
        .upsert(row, { onConflict: 'app_id,dedup_key' })
        .select('id')
        .maybeSingle()
    : supabase.from('workspace_app_records').insert(row).select('id').maybeSingle()

  const { data, error } = await query
  if (error) return c.json({ error: error.message }, 500)

  // Bump the app's updated_at so it sorts to the top of the list.
  await supabase
    .from('workspace_apps')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', app.id as string)

  return c.json({ ok: true, id: data?.id })
})

/**
 * PATCH /:slug/records/:recordId — edit a record's data/status (user
 * interaction). Ported verbatim from web `api/apps/[slug]/records/[recordId]/route.ts`.
 */
appsRoute.patch('/:slug/records/:recordId', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const recordId = c.req.param('recordId')
  let body: { data?: unknown; status?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    // tolerate empty body
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.data && typeof body.data === 'object') patch.data = body.data
  if (typeof body.status === 'string') patch.status = body.status

  const { error } = await supabaseAdmin()
    .from('workspace_app_records')
    .update(patch)
    .eq('id', recordId)
    .eq('workspace_id', ws)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ ok: true })
})

/**
 * DELETE /:slug/records/:recordId — delete a record (user interaction).
 * Ported verbatim from web `api/apps/[slug]/records/[recordId]/route.ts`.
 */
appsRoute.delete('/:slug/records/:recordId', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const recordId = c.req.param('recordId')

  const { error } = await supabaseAdmin()
    .from('workspace_app_records')
    .delete()
    .eq('id', recordId)
    .eq('workspace_id', ws)
  if (error) return c.json({ error: error.message }, 500)
  return c.json({ ok: true })
})
