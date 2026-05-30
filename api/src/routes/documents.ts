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
 *   GET /v1/documents              → { documents: DocSummary[] }
 *   GET /v1/documents?runId=<uuid> → outputs a specific run produced
 *   GET /v1/documents/:slug        → { document: DocDetail | null }
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
