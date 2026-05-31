import { sql } from 'drizzle-orm'

import { supabaseAdmin } from './supabase.js'
import type { WorkspacePlan } from './jwt.js'
import { getStripe } from './stripe.js'
import { db } from '../db/index.js'
import { logger } from '../middleware/logger.js'

export interface SubscriptionRow {
  workspace_id: string
  plan: WorkspacePlan
  seat_count: number
  price_per_seat_cents: number
  status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

const SUB_COLS =
  'workspace_id, plan, seat_count, price_per_seat_cents, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end'

/** The workspace's subscription row, or null if none exists yet. */
export async function getSubscription(workspaceId: string): Promise<SubscriptionRow | null> {
  const { data } = await supabaseAdmin()
    .from('subscriptions')
    .select(SUB_COLS)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  return (data as SubscriptionRow | null) ?? null
}

/** Active seats (members) on a workspace — drives the per-seat billing quantity. */
export async function activeSeatCount(workspaceId: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from('workspace_members')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('seat_status', 'active')
  return Math.max(1, count ?? 1)
}

/** Email of the workspace owner (for the Stripe customer record). */
export async function ownerEmailFor(workspaceId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from('workspace_members')
    .select('accounts(email)')
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner')
    .eq('seat_status', 'active')
    .limit(1)
    .maybeSingle()
  const acct = (Array.isArray(data?.accounts) ? data?.accounts[0] : data?.accounts) as
    | { email?: string }
    | null
    | undefined
  return acct?.email ?? null
}

/**
 * Managed-AI spend (cents) for the workspace this calendar month — what the
 * included-AI allowance is measured against. Sums `usage_tracking.cost_cents`,
 * the same meter the worker budget-gate uses. Best-effort: 0 on any error.
 */
export async function monthToDateManagedCents(workspaceId: string): Promise<number> {
  try {
    const rows = (await db.execute(sql`
      SELECT COALESCE(SUM(cost_cents), 0)::int AS cents
        FROM public.usage_tracking
       WHERE workspace_id = ${workspaceId}
         AND date >= date_trunc('month', now())::date
    `)) as unknown as Array<{ cents: number }>
    return rows[0]?.cents ?? 0
  } catch (err) {
    logger.warn(
      { workspaceId, err: err instanceof Error ? err.message : String(err) },
      'billing: monthToDateManagedCents failed',
    )
    return 0
  }
}

/**
 * Reflect the workspace's active seat count onto its Stripe subscription
 * quantity (per-seat billing) and the `seat_count` column. Best-effort: keeps
 * the column accurate always, and updates Stripe only when a subscription
 * exists (no-op on free). Never throws — call it after membership changes.
 */
export async function syncSubscriptionSeats(workspaceId: string): Promise<void> {
  try {
    const seats = await activeSeatCount(workspaceId)
    const sub = await getSubscription(workspaceId)
    await supabaseAdmin()
      .from('subscriptions')
      .update({ seat_count: seats, updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
    if (!sub?.stripe_subscription_id) return
    const stripe = getStripe()
    if (!stripe) return
    const s = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    const itemId = s.items.data[0]?.id
    if (!itemId) return
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: itemId, quantity: seats }],
      proration_behavior: 'create_prorations',
    })
    logger.info({ workspaceId, seats }, 'billing: synced Stripe subscription seats')
  } catch (err) {
    logger.warn(
      { workspaceId, err: err instanceof Error ? err.message : String(err) },
      'billing: syncSubscriptionSeats failed',
    )
  }
}
