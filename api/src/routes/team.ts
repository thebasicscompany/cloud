import { Hono } from 'hono'

import { supabaseAdmin } from '../lib/supabase.js'
import { getConfig } from '../config.js'
import { sendInviteEmail } from '../lib/email-invite.js'
import type { WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'

/**
 * Team — workspace invitations + membership (multi-seat).
 *
 * Ported from the web data lib + mutation routes (`web/src/lib/invitations.ts`,
 * `web/src/app/api/team/{invite,accept,revoke}/route.ts`), but scoped to the
 * VERIFIED workspace JWT (`c.var.workspace.workspace_id`) instead of a
 * service-role admin client + the client-supplied `workspaceId`. The inviter is
 * the JWT's `account_id`.
 *
 *   GET    /v1/team            → { members: WorkspaceMember[], invitations: Invitation[] }
 *   POST   /v1/team/invite     → create invite (+ SES email) for the JWT workspace
 *   POST   /v1/team/accept     → accept an invite by token (find-or-create account, add member)
 *   POST   /v1/team/revoke     → revoke a pending invite (scoped to the JWT workspace)
 *
 * The invite email is sent SERVER-SIDE here (cloud/api owns the SES creds — the
 * renderer must not). `accept` is authenticated by ANY valid workspace JWT but
 * operates on the invite's OWN workspace (the accepting user typically isn't a
 * member of it yet), so it is NOT cross-checked against the JWT workspace.
 */

type Vars = { requestId: string; workspace: WorkspaceToken }
export const teamRoute = new Hono<{ Variables: Vars }>()

interface Invitation {
  id: string
  workspaceId: string
  email: string
  role: string
  token: string
  status: string
  createdAt: string | null
  expiresAt: string | null
  acceptedAt: string | null
}

interface WorkspaceMember {
  accountId: string
  email: string | null
  displayName: string | null
  role: string
  seatStatus: string | null
  joinedAt: string | null
}

function mapInvitation(r: Record<string, unknown>): Invitation {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    email: r.email as string,
    role: r.role as string,
    token: r.token as string,
    status: r.status as string,
    createdAt: (r.created_at as string) ?? null,
    expiresAt: (r.expires_at as string) ?? null,
    acceptedAt: (r.accepted_at as string) ?? null,
  }
}

const INVITE_COLS = 'id,workspace_id,email,role,token,status,created_at,expires_at,accepted_at'

// ─── GET / — members + invitations for the JWT workspace ──────────────────

teamRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const supabase = supabaseAdmin()

  const [memberRes, inviteRes] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('account_id,role,seat_status,joined_at,accounts(email,display_name)')
      .eq('workspace_id', ws)
      .order('joined_at', { ascending: true }),
    supabase
      .from('workspace_invitations')
      .select(INVITE_COLS)
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const members: WorkspaceMember[] = (memberRes.data ?? []).map((r) => {
    const acct = (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts) as
      | { email?: string; display_name?: string }
      | null
    return {
      accountId: r.account_id as string,
      email: acct?.email ?? null,
      displayName: acct?.display_name ?? null,
      role: r.role as string,
      seatStatus: (r.seat_status as string) ?? null,
      joinedAt: (r.joined_at as string) ?? null,
    }
  })

  const invitations = (inviteRes.data ?? []).map((r) => mapInvitation(r as Record<string, unknown>))
  return c.json({ members, invitations })
})

// ─── POST /invite — create invite + email (server-side SES) ───────────────

teamRoute.post('/invite', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  let body: { email?: unknown; role?: unknown; workspaceName?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    /* tolerate */
  }
  const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!rawEmail) return c.json({ ok: false, error: 'workspaceId and email are required.' }, 400)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
    return c.json({ ok: false, error: 'Enter a valid email.' }, 400)
  }
  const role = typeof body.role === 'string' ? body.role : 'member'

  const supabase = supabaseAdmin()

  // Reuse an existing pending invite for the same (workspace, email).
  let invitation: Invitation | null = null
  const existing = await supabase
    .from('workspace_invitations')
    .select(INVITE_COLS)
    .eq('workspace_id', ws)
    .eq('email', rawEmail)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing.data) {
    invitation = mapInvitation(existing.data as Record<string, unknown>)
  } else {
    const { data, error } = await supabase
      .from('workspace_invitations')
      .insert({ workspace_id: ws, email: rawEmail, role })
      .select(INVITE_COLS)
      .single()
    if (error || !data) {
      return c.json({ ok: false, error: error?.message ?? 'Could not create invitation.' }, 400)
    }
    invitation = mapInvitation(data as Record<string, unknown>)
  }

  const base = (getConfig().APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const acceptUrl = `${base}/invite/${invitation.token}`
  const workspaceName =
    typeof body.workspaceName === 'string' && body.workspaceName
      ? body.workspaceName
      : 'your basichome workspace'
  const sent = await sendInviteEmail({
    to: invitation.email,
    workspaceName,
    acceptUrl,
    role: invitation.role,
  })

  return c.json({
    ok: true,
    invitation: { ...invitation, token: undefined },
    acceptUrl,
    emailed: sent.ok,
    emailMessageId: sent.messageId,
    emailError: sent.error,
  })
})

// ─── POST /accept — accept an invite by token ─────────────────────────────

teamRoute.post('/accept', requireWorkspaceJwt, async (c) => {
  let body: { token?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    /* tolerate */
  }
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) return c.json({ ok: false, error: 'token is required.' }, 400)

  const supabase = supabaseAdmin()

  const inv = await supabase
    .from('workspace_invitations')
    .select('id,workspace_id,email,role,status,expires_at')
    .eq('token', token)
    .maybeSingle()
  if (!inv.data) return c.json({ ok: false, error: 'Invitation not found.' }, 400)
  if (inv.data.status === 'accepted') {
    return c.json({ ok: true, workspaceId: inv.data.workspace_id as string })
  }
  if (inv.data.status !== 'pending') {
    return c.json({ ok: false, error: `Invitation is ${inv.data.status}.` }, 400)
  }
  if (inv.data.expires_at && new Date(inv.data.expires_at as string).getTime() < Date.now()) {
    await supabase.from('workspace_invitations').update({ status: 'expired' }).eq('id', inv.data.id)
    return c.json({ ok: false, error: 'Invitation has expired.' }, 400)
  }

  const email = (inv.data.email as string).toLowerCase()

  // Find-or-create the account for this email (accounts is a standalone table).
  const acct = await supabase.from('accounts').select('id').eq('email', email).maybeSingle()
  let accountId = acct.data?.id as string | undefined
  if (!accountId) {
    const created = await supabase
      .from('accounts')
      .insert({ email, display_name: email.split('@')[0] })
      .select('id')
      .single()
    if (created.error || !created.data) {
      return c.json({ ok: false, error: created.error?.message ?? 'Could not create account.' }, 400)
    }
    accountId = created.data.id as string
  }

  // Add the member if not already on the workspace (idempotent → multi-seat).
  const member = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', inv.data.workspace_id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (!member.data) {
    const added = await supabase.from('workspace_members').insert({
      workspace_id: inv.data.workspace_id,
      account_id: accountId,
      role: inv.data.role,
      seat_status: 'active',
    })
    if (added.error) return c.json({ ok: false, error: added.error.message }, 400)
  }

  await supabase
    .from('workspace_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: accountId })
    .eq('id', inv.data.id)

  const ws = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', inv.data.workspace_id)
    .maybeSingle()

  return c.json({
    ok: true,
    workspaceId: inv.data.workspace_id as string,
    workspaceName: (ws.data?.name as string) ?? 'workspace',
  })
})

// ─── POST /revoke — revoke a pending invite (scoped to JWT workspace) ──────

teamRoute.post('/revoke', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  let body: { id?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    /* tolerate */
  }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return c.json({ ok: false, error: 'id is required.' }, 400)

  const { error } = await supabaseAdmin()
    .from('workspace_invitations')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('workspace_id', ws)
    .eq('status', 'pending')
  if (error) return c.json({ ok: false, error: error.message }, 400)
  return c.json({ ok: true })
})
