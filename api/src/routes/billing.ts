import { Hono } from 'hono'
import { sql } from 'drizzle-orm'

import { db } from '../db/index.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { hasRole, type WorkspaceToken } from '../lib/jwt.js'
import { requireWorkspaceJwt } from '../middleware/jwt.js'
import { getConfig } from '../config.js'
import { getStripe, priceIdForPlan } from '../lib/stripe.js'
import {
  getSubscription,
  activeSeatCount,
  ownerEmailFor,
  monthToDateManagedCents,
} from '../lib/billing.js'
import { PLAN_CATALOG, planLimits, monthlyManagedCreditPoolCents } from '../lib/plan-limits.js'

/**
 * Per-workspace billing. Each workspace is its own Stripe customer with one
 * subscription, billed per active SEAT on a plan price. Reads are open to any
 * member; checkout + portal require admin/owner.
 *
 *   GET  /v1/billing          → current plan, limits, seats, period, catalog
 *   POST /v1/billing/checkout → { plan } → Stripe Checkout Session url (admin+)
 *   GET  /v1/billing/portal   → Stripe Billing Portal url (admin+)
 *
 * The subscription row is the source of truth for plan/status/seats; the Stripe
 * webhook (`/webhooks/stripe`) keeps it in sync. Limits come from PLAN_LIMITS
 * (code), keyed by plan, so a tier can never be exceeded even if the row drifts.
 */
type Vars = { requestId: string; workspace: WorkspaceToken }
export const billingRoute = new Hono<{ Variables: Vars }>()

function returnBase(): string {
  const cfg = getConfig()
  return (cfg.BILLING_RETURN_URL ?? cfg.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

// ─── GET / — plan, limits, seats, billing period, catalog ──────────────────
billingRoute.get('/', requireWorkspaceJwt, async (c) => {
  const ws = c.var.workspace.workspace_id
  const sub = await getSubscription(ws)
  const seats = await activeSeatCount(ws)
  const plan = sub?.plan ?? c.var.workspace.plan
  const managedUsedCents = await monthToDateManagedCents(ws)

  // Per-resource usage for the billing panel's progress bars. The enforcement
  // already happens at the route layer (agents.ts POST / and cloud-run-dispatch
  // dailyCloudMinutes gate); these reads just surface the SAME numbers in the
  // UI so the user sees "you've used X of Y" before hitting 402.
  const [agentsCnt, cloudSec] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM public.client_agents WHERE workspace_id = ${ws}`),
    db.execute(sql`
      SELECT COALESCE(SUM(duration_seconds), 0)::int AS sec
        FROM public.cloud_runs
       WHERE workspace_id = ${ws}
         AND browser_target = 'cloud'
         AND started_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
    `),
  ]) as unknown as [Array<{ cnt: number }>, Array<{ sec: number }>]

  return c.json({
    plan,
    status: sub?.status ?? 'active',
    seats,
    seatCount: sub?.seat_count ?? seats,
    pricePerSeatCents: sub?.price_per_seat_cents ?? 0,
    currentPeriodEnd: sub?.current_period_end ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    hasStripeCustomer: Boolean(sub?.stripe_customer_id),
    limits: planLimits(plan),
    monthlyManagedCreditPoolCents: monthlyManagedCreditPoolCents(plan, seats),
    managedUsedCents,
    agentCount: agentsCnt[0]?.cnt ?? 0,
    cloudMinutesUsedToday: Math.floor((cloudSec[0]?.sec ?? 0) / 60),
    catalog: PLAN_CATALOG,
    canManageBilling: hasRole(c.var.workspace.role ?? 'member', 'admin'),
  })
})

// ─── POST /checkout — start a subscription Checkout Session (admin+) ────────
billingRoute.post('/checkout', requireWorkspaceJwt, async (c) => {
  if (!hasRole(c.var.workspace.role ?? 'member', 'admin')) {
    return c.json({ error: 'insufficient_role', message: 'Only admins and owners can manage billing.' }, 403)
  }
  const stripe = getStripe()
  if (!stripe) return c.json({ error: 'not_configured', message: 'Billing is not configured.' }, 503)

  let body: { plan?: unknown } = {}
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    /* tolerate */
  }
  const plan = body.plan
  if (plan !== 'pro' && plan !== 'team') {
    return c.json({ error: 'invalid_plan', message: 'Choose a self-serve plan (pro or team).' }, 400)
  }
  const priceId = priceIdForPlan(plan)
  if (!priceId) {
    return c.json({ error: 'price_not_configured', message: `No Stripe price configured for ${plan}.` }, 503)
  }

  const ws = c.var.workspace.workspace_id
  const sub = await getSubscription(ws)
  const seats = await activeSeatCount(ws)

  // Ensure a Stripe customer for this workspace (one customer per workspace).
  let customerId = sub?.stripe_customer_id ?? null
  if (!customerId) {
    const wsRow = await supabaseAdmin().from('workspaces').select('name').eq('id', ws).maybeSingle()
    const email = await ownerEmailFor(ws)
    const customer = await stripe.customers.create({
      name: (wsRow.data?.name as string) ?? 'Basics workspace',
      email: email ?? undefined,
      metadata: { workspace_id: ws },
    })
    customerId = customer.id
    await supabaseAdmin()
      .from('subscriptions')
      .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
      .eq('workspace_id', ws)
  }

  const base = returnBase()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: Math.max(1, seats) }],
    allow_promotion_codes: true,
    success_url: `${base}/settings/billing?status=success`,
    cancel_url: `${base}/settings/billing?status=cancelled`,
    subscription_data: { metadata: { workspace_id: ws, plan } },
    metadata: { workspace_id: ws, plan },
  })
  return c.json({ url: session.url })
})

// ─── GET /portal — manage the existing subscription (admin+) ────────────────
billingRoute.get('/portal', requireWorkspaceJwt, async (c) => {
  if (!hasRole(c.var.workspace.role ?? 'member', 'admin')) {
    return c.json({ error: 'insufficient_role', message: 'Only admins and owners can manage billing.' }, 403)
  }
  const stripe = getStripe()
  if (!stripe) return c.json({ error: 'not_configured' }, 503)
  const ws = c.var.workspace.workspace_id
  const sub = await getSubscription(ws)
  if (!sub?.stripe_customer_id) {
    return c.json({ error: 'no_customer', message: 'No billing account yet — upgrade first.' }, 404)
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${returnBase()}/settings/billing`,
  })
  return c.json({ url: portal.url })
})
