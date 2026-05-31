import Stripe from 'stripe'

import { getConfig } from '../config.js'
import type { WorkspacePlan } from './jwt.js'
import { PLAN_CATALOG } from './plan-limits.js'

let _stripe: Stripe | null = null

/**
 * Lazy Stripe client. Returns `null` when `STRIPE_SECRET_KEY` is unset, so
 * billing endpoints degrade to 503 `not_configured` rather than crashing on
 * boot (mirrors the rest of the capability-gated config).
 */
export function getStripe(): Stripe | null {
  if (_stripe) return _stripe
  const key = getConfig().STRIPE_SECRET_KEY
  if (!key) return null
  _stripe = new Stripe(key, { appInfo: { name: 'basics-api' } })
  return _stripe
}

/** Stripe Price ID for a paid plan's per-seat monthly price, from env. */
export function priceIdForPlan(plan: WorkspacePlan): string | null {
  const entry = PLAN_CATALOG.find((p) => p.plan === plan)
  if (!entry?.stripePriceEnv) return null
  const id = getConfig()[entry.stripePriceEnv]
  return id && id.length > 0 ? id : null
}

/** Reverse map: a Stripe Price ID back to our plan (for webhook sync). */
export function planForPriceId(priceId: string | null | undefined): WorkspacePlan | null {
  if (!priceId) return null
  const cfg = getConfig()
  if (cfg.STRIPE_PRICE_PRO && priceId === cfg.STRIPE_PRICE_PRO) return 'pro'
  if (cfg.STRIPE_PRICE_TEAM && priceId === cfg.STRIPE_PRICE_TEAM) return 'team'
  return null
}
