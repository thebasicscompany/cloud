import type { WorkspacePlan } from './jwt.js'

/**
 * Canonical per-plan limits — the single source of truth for what each plan
 * gets. Enforcement reads `PLAN_LIMITS[plan]` (the plan travels in the verified
 * workspace JWT), so a workspace can never exceed its tier even if the stored
 * subscription row drifts.
 *
 * Billing model: per active SEAT + a managed-AI allowance — NEVER per token.
 *
 * Cost drivers we meter:
 *  1. MANAGED AI (primary). A run that uses our pooled Anthropic/Gemini keys via
 *     the managed gateway spends OUR credits — regardless of whether the agent
 *     executed on the user's machine ("local") or in the cloud. So the meter is
 *     managed-AI COST (cents), tracked per workspace in `usage_tracking`, NOT
 *     where the run ran. Each plan includes `monthlyManagedCreditCents` of this
 *     usage PER SEAT; hitting it hard-blocks managed LLM (upgrade or BYOK).
 *  2. CLOUD COMPUTE (secondary). Cloud (Fargate) runs also burn our server time;
 *     `dailyCloudMinutes` caps that. Local runs don't consume it.
 *
 * BYOK (Team+): when a workspace uses its OWN provider keys, that inference is
 * billed to the customer by their provider — it never draws from our managed
 * allowance and isn't our cost. That's why BYOK is gated to higher tiers.
 *
 * `null` means unlimited.
 */
export interface PlanLimits {
  /** Saved cloud agents the workspace may keep. */
  maxAgents: number | null
  /** Cloud runs allowed to execute concurrently. */
  maxConcurrentRuns: number | null
  /**
   * Included managed-AI usage per UTC month, in cost cents WE absorb (our
   * Anthropic/Gemini spend), PER SEAT — the workspace pool is this × seat_count.
   * Consumed by ANY managed-LLM call, local OR cloud. BYOK usage never draws
   * from it. `null` = unlimited (enterprise).
   */
  monthlyManagedCreditCents: number | null
  /** Cloud Fargate compute minutes per UTC day (cloud runs only — our AWS cost). */
  dailyCloudMinutes: number | null
  /** Smallest allowed schedule interval; `null` = scheduling not allowed. */
  minScheduleIntervalMinutes: number | null
  /** Paid seats the workspace may hold; `null` = unlimited (per-seat billed). */
  seatLimit: number | null
  /** May this plan store its own provider keys (BYOK)? */
  allowByok: boolean
  /** Self-serve Stripe checkout available (`false` = contact sales). */
  selfServe: boolean
}

export const PLAN_LIMITS: Record<WorkspacePlan, PlanLimits> = {
  free: {
    maxAgents: 2,
    maxConcurrentRuns: 1,
    monthlyManagedCreditCents: 100, // ~$1/mo of managed inference
    dailyCloudMinutes: 10,
    minScheduleIntervalMinutes: null,
    seatLimit: 1,
    allowByok: false,
    selfServe: true,
  },
  pro: {
    maxAgents: 10,
    maxConcurrentRuns: 2,
    monthlyManagedCreditCents: 1500, // ~$15/seat/mo of managed inference
    dailyCloudMinutes: 120,
    minScheduleIntervalMinutes: 30,
    seatLimit: 3,
    allowByok: false,
    selfServe: true,
  },
  team: {
    maxAgents: 50,
    maxConcurrentRuns: 5,
    monthlyManagedCreditCents: 3000, // ~$30/seat/mo, or bring your own keys
    dailyCloudMinutes: 480,
    minScheduleIntervalMinutes: 15,
    seatLimit: null,
    allowByok: true,
    selfServe: true,
  },
  enterprise: {
    maxAgents: null,
    maxConcurrentRuns: null,
    monthlyManagedCreditCents: null, // unlimited / BYOK
    dailyCloudMinutes: null,
    minScheduleIntervalMinutes: 5,
    seatLimit: null,
    allowByok: true,
    selfServe: false,
  },
}

export function planLimits(plan: WorkspacePlan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
}

/**
 * Managed-AI credit pool for a workspace this month, in cents — the per-seat
 * allowance scaled by paid seats. `null` (enterprise) means unmetered.
 */
export function monthlyManagedCreditPoolCents(plan: WorkspacePlan, seatCount: number): number | null {
  const perSeat = planLimits(plan).monthlyManagedCreditCents
  if (perSeat === null) return null
  return perSeat * Math.max(1, seatCount)
}

/** Marketing/display catalog — pricing + which Stripe price each plan maps to. */
export interface PlanCatalogEntry {
  plan: WorkspacePlan
  name: string
  /** Monthly price per seat in cents (0 = free, `null` = contact sales). */
  pricePerSeatCents: number | null
  blurb: string
  /** Env var holding the Stripe Price ID for this plan's per-seat price. */
  stripePriceEnv?: 'STRIPE_PRICE_PRO' | 'STRIPE_PRICE_TEAM'
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    plan: 'free',
    name: 'Free',
    pricePerSeatCents: 0,
    blurb: 'For solo use — the app, local agents and a small included-AI trial.',
  },
  {
    plan: 'pro',
    name: 'Pro',
    pricePerSeatCents: 2000,
    blurb: 'For power users and tiny teams — more included AI and cloud automation.',
    stripePriceEnv: 'STRIPE_PRICE_PRO',
  },
  {
    plan: 'team',
    name: 'Team',
    pricePerSeatCents: 4000,
    blurb: 'For teams — roles, shared resources, scheduling and bring-your-own keys.',
    stripePriceEnv: 'STRIPE_PRICE_TEAM',
  },
  {
    plan: 'enterprise',
    name: 'Enterprise',
    pricePerSeatCents: null,
    blurb: 'SSO, unlimited scale and priority support.',
  },
]

export function catalogFor(plan: WorkspacePlan): PlanCatalogEntry {
  return (
    PLAN_CATALOG.find((p) => p.plan === plan) ??
    PLAN_CATALOG[0] ?? { plan: 'free', name: 'Free', pricePerSeatCents: 0, blurb: '' }
  )
}

/**
 * Thrown when an action would exceed the workspace plan's limits. Route handlers
 * catch it and map to HTTP 402 with `{ error: 'plan_limit', code, message }`.
 */
export class PlanLimitError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PlanLimitError'
  }
}
