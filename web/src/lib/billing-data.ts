import "server-only";

import { cloudGet } from "@/lib/api/cloud";

export type BillingPlan = "free" | "pro" | "team" | "enterprise";

export type PlanLimits = {
  maxAgents: number | null;
  maxConcurrentRuns: number | null;
  monthlyManagedCreditCents: number | null;
  dailyCloudMinutes: number | null;
  minScheduleIntervalMinutes: number | null;
  seatLimit: number | null;
  allowByok: boolean;
  selfServe: boolean;
};

export type PlanCatalogEntry = {
  plan: BillingPlan;
  name: string;
  pricePerSeatCents: number | null;
  blurb: string;
};

export type Billing = {
  plan: BillingPlan;
  status: string;
  seats: number;
  seatCount: number;
  pricePerSeatCents: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
  limits: PlanLimits;
  monthlyManagedCreditPoolCents: number | null;
  managedUsedCents: number;
  /** Saved agents in this workspace - compared against limits.maxAgents. */
  agentCount: number;
  /** Cloud-run minutes consumed UTC-today, compared against limits.dailyCloudMinutes. */
  cloudMinutesUsedToday: number;
  catalog: PlanCatalogEntry[];
  canManageBilling: boolean;
};

const FALLBACK: Billing = {
  plan: "free",
  status: "active",
  seats: 1,
  seatCount: 1,
  pricePerSeatCents: 0,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  hasStripeCustomer: false,
  limits: {
    maxAgents: 2,
    maxConcurrentRuns: 1,
    monthlyManagedCreditCents: 100,
    dailyCloudMinutes: 10,
    minScheduleIntervalMinutes: null,
    seatLimit: 1,
    allowByok: false,
    selfServe: true,
  },
  monthlyManagedCreditPoolCents: 100,
  managedUsedCents: 0,
  agentCount: 0,
  cloudMinutesUsedToday: 0,
  catalog: [],
  canManageBilling: false,
};

/** The signed-in workspace's billing state (plan, usage, seats, catalog). */
export async function getBilling(): Promise<Billing> {
  return cloudGet<Billing>("/v1/billing", FALLBACK);
}
