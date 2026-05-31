import { Hono } from 'hono'
import type Stripe from 'stripe'

import { getStripe, planForPriceId } from '../lib/stripe.js'
import { getConfig } from '../config.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { logger } from '../middleware/logger.js'
import { catalogFor } from '../lib/plan-limits.js'
import type { WorkspacePlan } from '../lib/jwt.js'

/**
 * Stripe webhook → keeps each workspace's `subscriptions` row in sync with
 * Stripe. Public route: authenticated by the Stripe signature (verified against
 * STRIPE_WEBHOOK_SECRET on the RAW body), not a workspace JWT. Mounted at
 * `/webhooks/stripe` before any body-consuming middleware.
 */
export const billingWebhookRoute = new Hono()

// Stripe moved period fields onto the subscription item in recent API versions;
// read from either location defensively so we don't depend on the exact version.
interface LoosePeriod {
  current_period_start?: number
  current_period_end?: number
}

billingWebhookRoute.post('/stripe', async (c) => {
  const stripe = getStripe()
  const secret = getConfig().STRIPE_WEBHOOK_SECRET
  if (!stripe || !secret) return c.json({ error: 'not_configured' }, 503)

  const sig = c.req.header('stripe-signature')
  if (!sig) return c.json({ error: 'missing_signature' }, 400)

  const raw = await c.req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret)
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'stripe webhook: signature verification failed',
    )
    return c.json({ error: 'invalid_signature' }, 400)
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await applySubscription(event.data.object as Stripe.Subscription, false)
        break
      case 'customer.subscription.deleted':
        await applySubscription(event.data.object as Stripe.Subscription, true)
        break
      default:
        // Other events (invoices, checkout.session.completed) are derivable from
        // the subscription.* events above; ignore to keep the handler simple.
        break
    }
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), type: event.type },
      'stripe webhook: handler failed',
    )
    return c.json({ error: 'handler_error' }, 500)
  }
  return c.json({ received: true })
})

/**
 * Reconcile a workspace's subscription row from a Stripe Subscription.
 * `deleted` (subscription cancelled/ended) reverts the workspace to free.
 */
async function applySubscription(sub: Stripe.Subscription, deleted: boolean): Promise<void> {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  // Resolve the workspace: prefer the metadata we stamped at checkout, else map
  // by the stored stripe_customer_id.
  let ws = (sub.metadata?.workspace_id as string | undefined) ?? null
  if (!ws) {
    const row = await supabaseAdmin()
      .from('subscriptions')
      .select('workspace_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    ws = (row.data?.workspace_id as string | undefined) ?? null
  }
  if (!ws) {
    logger.warn({ customerId }, 'stripe webhook: no workspace for customer')
    return
  }

  const item = sub.items?.data?.[0]
  const priceId = item?.price?.id
  const plan: WorkspacePlan = deleted ? 'free' : planForPriceId(priceId) ?? 'free'
  const cat = catalogFor(plan)
  const seatCount = deleted ? 1 : item?.quantity ?? 1

  const itemPeriod = item as unknown as LoosePeriod | undefined
  const subPeriod = sub as unknown as LoosePeriod
  const startSec = itemPeriod?.current_period_start ?? subPeriod.current_period_start
  const endSec = itemPeriod?.current_period_end ?? subPeriod.current_period_end

  await supabaseAdmin()
    .from('subscriptions')
    .update({
      plan,
      // free is always 'active'; otherwise mirror Stripe's status verbatim.
      status: deleted ? 'active' : sub.status,
      seat_count: seatCount,
      price_per_seat_cents: cat.pricePerSeatCents ?? 0,
      stripe_subscription_id: deleted ? null : sub.id,
      stripe_customer_id: customerId,
      current_period_start: startSec ? new Date(startSec * 1000).toISOString() : null,
      current_period_end: endSec ? new Date(endSec * 1000).toISOString() : null,
      cancel_at_period_end: deleted ? false : sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', ws)

  logger.info({ ws, plan, status: deleted ? 'active' : sub.status, seatCount }, 'stripe webhook: subscription synced')
}
