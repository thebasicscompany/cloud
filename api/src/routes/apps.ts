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
 *   GET /v1/apps               → { apps: AppSummary[] }
 *   GET /v1/apps/:slug         → { app: AppDetail | null }   (404 when missing)
 *   GET /v1/apps/:slug/records → { records: AppRecord[] }    (404 when app missing)
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
