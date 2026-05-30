import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

/**
 * Automation suggestions — the "I noticed you do X, want to automate it?" surface.
 *
 * Ported from the web data lib `web/src/lib/suggestions-data.ts`, but scoped to
 * the VERIFIED workspace JWT (`c.var.workspace.workspace_id`) instead of a
 * service-role admin client + a hardcoded PRIMARY_WORKSPACE_ID. Each token only
 * ever reads/writes its own workspace's suggestions — so this can power the
 * renderer directly (no admin key on the client, no cross-workspace leak).
 *
 *   GET   /v1/suggestions       → { suggestions: Suggestion[] }  (pending only)
 *   PATCH /v1/suggestions/:id    body { status } → { ok: true }
 *
 * NOTE: the two recurrence-clustering GENERATORS (run history + lens) are NOT
 * here. Those are write-heavy batch jobs that must run server-side (a worker /
 * route job) under the platform's own workspace context, not per renderer read.
 * This route only exposes the read + the dismiss/accept mutation.
 */

export type SuggestionSource = 'runs' | 'lens' | 'manual'

export interface Suggestion {
  id: string
  source: SuggestionSource
  title: string
  rationale: string
  suggestedPrompt: string
  evidence: Record<string, unknown>
  confidence: number | null
  createdAt: string
}

interface SuggestionRow {
  id: string
  source: string
  title: string
  rationale: string
  suggested_prompt: string
  evidence: Record<string, unknown> | null
  confidence: number | null
  created_at: string
}

function mapRow(r: SuggestionRow): Suggestion {
  return {
    id: r.id,
    source: (['runs', 'lens', 'manual'] as const).includes(r.source as SuggestionSource)
      ? (r.source as SuggestionSource)
      : 'manual',
    title: r.title,
    rationale: r.rationale,
    suggestedPrompt: r.suggested_prompt,
    evidence: r.evidence ?? {},
    confidence: r.confidence,
    createdAt: r.created_at,
  }
}

type Vars = { requestId: string; workspace: WorkspaceToken }
export const suggestionsRoute = new Hono<{ Variables: Vars }>()

/** GET / — pending suggestions for the JWT's workspace (mirrors getPendingSuggestions). */
suggestionsRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const { data } = await supabaseAdmin()
    .from('automation_suggestions')
    .select('id,source,title,rationale,suggested_prompt,evidence,confidence,created_at')
    .eq('workspace_id', ws)
    .eq('status', 'pending')
    .order('confidence', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(6)
  const suggestions = ((data ?? []) as SuggestionRow[]).map(mapRow)
  return c.json({ suggestions })
})

/**
 * PATCH /:id — update a suggestion's status (mirrors setSuggestionStatus).
 * "dismissed" hides it for good; "accepted" records the user chose to build it.
 * The update is scoped to the JWT's workspace so a token can't touch another
 * workspace's suggestion.
 */
suggestionsRoute.patch('/:id', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const id = c.req.param('id')
  let body: { status?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    /* tolerate empty body — defaults to dismissed */
  }
  const status = body.status === 'accepted' ? 'accepted' : 'dismissed'
  const { error } = await supabaseAdmin()
    .from('automation_suggestions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', ws)
  if (error) return c.json({ ok: false }, 500)
  return c.json({ ok: true })
})
