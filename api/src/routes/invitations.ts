import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import type { WorkspaceToken } from '../lib/jwt.js'

/**
 * Invitations — PUBLIC (unauthenticated) invite-token lookups.
 *
 * Unlike `/v1/team` (which requires a workspace JWT and is scoped to a member's
 * own workspace), this surface is hit by an INVITEE who is not yet a member of
 * the inviting workspace — so they have no workspace JWT to present. The opaque,
 * unguessable invite `token` IS the credential here: knowing it is what proves
 * the caller was invited. We therefore mount this WITHOUT `requireWorkspaceJwt`.
 *
 * Only a minimal, non-sensitive preview is returned (email, role, status,
 * workspace name, expired flag) — exactly what the `/invite/[token]` accept page
 * needs to render. No member lists, no other invitations, no secrets.
 *
 *   GET /v1/invitations/preview?token=… → InvitationPreview | { error }
 *
 * Ported VERBATIM from the web data lib `web/src/lib/invitations.ts`
 * (`getInvitationPreview`), which used the service-role admin client directly in
 * the renderer.
 */

type Vars = { requestId: string; workspace?: WorkspaceToken }
export const invitationsRoute = new Hono<{ Variables: Vars }>()

interface InvitationPreview {
  email: string
  role: string
  status: string
  workspaceName: string
  expired: boolean
}

// ─── GET /preview?token=… — unauthenticated preview by invite token ────────

invitationsRoute.get('/preview', async (c) => {
  const token = c.req.query('token')
  if (!token) return c.json({ error: 'token is required.' }, 400)

  const { data } = await supabaseAdmin()
    .from('workspace_invitations')
    .select('email,role,status,expires_at,workspaces(name)')
    .eq('token', token)
    .maybeSingle()
  if (!data) return c.json({ error: 'not_found' }, 404)

  const ws = (Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces) as
    | { name?: string }
    | null
  const preview: InvitationPreview = {
    email: data.email as string,
    role: data.role as string,
    status: data.status as string,
    workspaceName: ws?.name ?? 'workspace',
    expired: Boolean(
      data.expires_at && new Date(data.expires_at as string).getTime() < Date.now(),
    ),
  }
  return c.json(preview)
})
