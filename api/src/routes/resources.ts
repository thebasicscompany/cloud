import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import { logger } from '../middleware/logger.js'
import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'
import { requireRole } from '../middleware/role.js'

/**
 * Workspace resources - user + agent-managed registry of long-lived artifacts
 * (Notion pages, Google docs, Airtable bases, Slack channels, ...) the agents
 * in this workspace should know about across runs. See migration
 * 0038_workspace_resources.sql for the schema rationale.
 *
 *   GET    /v1/resources           - list (filterable by kind / agent_access)
 *   POST   /v1/resources           - user adds one (or worker via tool)
 *   PATCH  /v1/resources/:id       - rename, change agent_access, edit URL/notes
 *   DELETE /v1/resources/:id       - drop from registry
 *
 * Agent-side: a separate worker tool (resource_register) writes to this table
 * after a Composio create-style call lands a new artifact.
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const resourcesRoute = new Hono<{ Variables: Vars }>()

const KIND_RE = /^[a-z0-9_]{1,60}$/
const TOOLKIT_RE = /^[a-z0-9_]{1,60}$/

const AGENT_ACCESS = z.enum(['none', 'read', 'read_write'])
const SOURCE = z.enum(['agent_created', 'user_added'])

interface ResourceRow {
  id: string
  workspace_id: string
  kind: string
  name: string
  url: string | null
  external_id: string | null
  description: string | null
  source: 'agent_created' | 'user_added'
  agent_access: 'none' | 'read' | 'read_write'
  toolkit_slug: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_run_id: string | null
}

function shape(row: ResourceRow) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    url: row.url,
    externalId: row.external_id,
    description: row.description,
    source: row.source,
    agentAccess: row.agent_access,
    toolkitSlug: row.toolkit_slug,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    createdByRunId: row.created_by_run_id,
  }
}

// ─── GET /v1/resources ────────────────────────────────────────────────────
resourcesRoute.get(
  '/',
  requireWorkspaceJwt,
  zValidator(
    'query',
    z.object({
      kind: z.string().optional(),
      agent_access: AGENT_ACCESS.optional(),
    }),
  ),
  async (c) => {
    const ws = c.var.workspace.workspace_id
    const q = c.req.valid('query')
    let query = supabaseAdmin().from('workspace_resources').select('*').eq('workspace_id', ws)
    if (q.kind) query = query.eq('kind', q.kind)
    if (q.agent_access) query = query.eq('agent_access', q.agent_access)
    query = query.order('updated_at', { ascending: false })
    const { data, error } = await query
    if (error) {
      logger.warn({ workspaceId: ws, err: error.message }, 'resources.list: db error')
      return c.json({ error: 'list_failed', message: error.message }, 500)
    }
    return c.json({ resources: (data ?? []).map((r) => shape(r as ResourceRow)) })
  },
)

// ─── POST /v1/resources ───────────────────────────────────────────────────
//
// Used by both the settings UI ("Add a resource" form) and the worker
// resource_register tool. Members can create rows; viewers can't.
const CreateBody = z.object({
  kind: z.string().regex(KIND_RE, 'kind must be lowercase ASCII / underscores'),
  name: z.string().min(1).max(200),
  url: z.string().url().max(2048).optional(),
  externalId: z.string().min(1).max(500).optional(),
  description: z.string().max(2000).optional(),
  source: SOURCE.optional(),
  agentAccess: AGENT_ACCESS.optional(),
  toolkitSlug: z.string().regex(TOOLKIT_RE).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdByRunId: z.string().uuid().optional(),
})

resourcesRoute.post(
  '/',
  requireWorkspaceJwt,
  requireRole('member'),
  zValidator('json', CreateBody),
  async (c) => {
    const ws = c.var.workspace.workspace_id
    const acc = c.var.workspace.account_id
    const body = c.req.valid('json')
    const row = {
      workspace_id: ws,
      kind: body.kind,
      name: body.name,
      url: body.url ?? null,
      external_id: body.externalId ?? null,
      description: body.description ?? null,
      source: body.source ?? 'user_added',
      agent_access: body.agentAccess ?? 'read_write',
      toolkit_slug: body.toolkitSlug ?? null,
      metadata: body.metadata ?? {},
      created_by: acc,
      created_by_run_id: body.createdByRunId ?? null,
    }
    const { data, error } = await supabaseAdmin()
      .from('workspace_resources')
      .insert(row)
      .select('*')
      .single()
    if (error) {
      // Unique-violation on (workspace_id, kind, external_id) means we
      // already know about this artifact. Treat that as a no-op success
      // so the agent's resource_register stays idempotent - it just looks
      // up the existing row and continues.
      if (error.code === '23505' && body.externalId) {
        const existing = await supabaseAdmin()
          .from('workspace_resources')
          .select('*')
          .eq('workspace_id', ws)
          .eq('kind', body.kind)
          .eq('external_id', body.externalId)
          .maybeSingle()
        if (existing.data) {
          return c.json({ resource: shape(existing.data as ResourceRow), existed: true })
        }
      }
      logger.warn({ workspaceId: ws, err: error.message }, 'resources.create: db error')
      return c.json({ error: 'create_failed', message: error.message }, 500)
    }
    return c.json({ resource: shape(data as ResourceRow), existed: false }, 201)
  },
)

// ─── PATCH /v1/resources/:id ─────────────────────────────────────────────
const PatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    url: z.string().url().max(2048).nullable().optional(),
    externalId: z.string().max(500).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    agentAccess: AGENT_ACCESS.optional(),
    toolkitSlug: z.string().regex(TOOLKIT_RE).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'patch body must not be empty')

resourcesRoute.patch(
  '/:id',
  requireWorkspaceJwt,
  requireRole('member'),
  zValidator('json', PatchBody),
  async (c) => {
    const ws = c.var.workspace.workspace_id
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const update: Record<string, unknown> = {}
    if (body.name !== undefined) update.name = body.name
    if (body.url !== undefined) update.url = body.url
    if (body.externalId !== undefined) update.external_id = body.externalId
    if (body.description !== undefined) update.description = body.description
    if (body.agentAccess !== undefined) update.agent_access = body.agentAccess
    if (body.toolkitSlug !== undefined) update.toolkit_slug = body.toolkitSlug
    if (body.metadata !== undefined) update.metadata = body.metadata
    const { data, error } = await supabaseAdmin()
      .from('workspace_resources')
      .update(update)
      .eq('workspace_id', ws)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      if (error.code === 'PGRST116') return c.json({ error: 'not_found' }, 404)
      logger.warn({ workspaceId: ws, id, err: error.message }, 'resources.patch: db error')
      return c.json({ error: 'patch_failed', message: error.message }, 500)
    }
    return c.json({ resource: shape(data as ResourceRow) })
  },
)

// ─── DELETE /v1/resources/:id ────────────────────────────────────────────
resourcesRoute.delete('/:id', requireWorkspaceJwt, requireRole('member'), async (c) => {
  const ws = c.var.workspace.workspace_id
  const id = c.req.param('id')
  const { error } = await supabaseAdmin()
    .from('workspace_resources')
    .delete()
    .eq('workspace_id', ws)
    .eq('id', id)
  if (error) {
    logger.warn({ workspaceId: ws, id, err: error.message }, 'resources.delete: db error')
    return c.json({ error: 'delete_failed', message: error.message }, 500)
  }
  return c.json({ ok: true })
})
