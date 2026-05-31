"use client";

import { useState } from "react";

import { useSearchParams } from "next/navigation";

import { Check, CreditCard, ExternalLink } from "@/icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Billing, BillingPlan } from "@/lib/billing-data";

function usd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

const PLAN_ORDER: BillingPlan[] = ["free", "pro", "team", "enterprise"];

export function BillingPanel({ billing }: { billing: Billing }) {
  const params = useSearchParams();
  const justReturned = params.get("status");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    plan,
    seats,
    pricePerSeatCents,
    monthlyManagedCreditPoolCents,
    managedUsedCents,
    catalog,
    canManageBilling,
    hasStripeCustomer,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    status,
  } = billing;

  async function upgrade(target: "pro" | "team") {
    setBusy(target);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: target }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.message ?? data.error ?? "Couldn’t start checkout. Billing may not be configured yet.");
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("manage");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal");
      const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.message ?? data.error ?? "Couldn’t open the billing portal.");
    } finally {
      setBusy(null);
    }
  }

  const usedPct =
    monthlyManagedCreditPoolCents && monthlyManagedCreditPoolCents > 0
      ? Math.min(100, Math.round((managedUsedCents / monthlyManagedCreditPoolCents) * 100))
      : 0;
  const monthlyTotal = pricePerSeatCents * seats;
  const orderedCatalog = [...catalog].sort((a, b) => PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan));

  return (
    <div className="space-y-6">
      {justReturned === "success" ? (
        <div className="rounded-lg border bg-card p-3 text-sm">
          Thanks! Your subscription is updating — it may take a moment to reflect here.
        </div>
      ) : null}
      {justReturned === "cancelled" ? (
        <div className="rounded-lg border bg-card p-3 text-muted-foreground text-sm">Checkout cancelled — no changes made.</div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">{error}</div>
      ) : null}

      {/* Current plan summary */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg capitalize">{plan}</span>
                <span className="rounded-full border px-2 py-0.5 text-muted-foreground text-xs capitalize">{status}</span>
              </div>
              <p className="text-muted-foreground text-sm">
                {plan === "free"
                  ? "Free workspace"
                  : `${usd(pricePerSeatCents)}/seat · ${seats} seat${seats === 1 ? "" : "s"} · ${usd(monthlyTotal)}/mo`}
              </p>
              {currentPeriodEnd ? (
                <p className="text-muted-foreground text-xs">
                  {cancelAtPeriodEnd ? "Cancels" : "Renews"} {new Date(currentPeriodEnd).toLocaleDateString()}
                </p>
              ) : null}
            </div>
            {canManageBilling && hasStripeCustomer ? (
              <Button variant="outline" size="sm" className="gap-1.5" disabled={busy === "manage"} onClick={manage}>
                <CreditCard className="size-3.5" /> Manage billing
              </Button>
            ) : null}
          </div>

          {/* Managed-AI usage */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Included AI used this month</span>
              <span className="font-medium">
                {usd(managedUsedCents)}
                {monthlyManagedCreditPoolCents !== null ? ` / ${usd(monthlyManagedCreditPoolCents)}` : " (unlimited)"}
              </span>
            </div>
            {monthlyManagedCreditPoolCents !== null ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", usedPct >= 100 ? "bg-destructive" : "bg-primary")}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            ) : null}
            <p className="text-muted-foreground text-xs">
              Managed Anthropic/Gemini usage on this workspace — local and cloud runs both count. Bring your own keys
              (Team plan and up) to remove this cap.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Plan catalog */}
      <div className="grid gap-3 sm:grid-cols-2">
        {orderedCatalog.map((entry) => {
          const isCurrent = entry.plan === plan;
          return (
            <Card key={entry.plan} className={cn(isCurrent && "border-primary")}>
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold capitalize">{entry.name}</span>
                    {isCurrent ? (
                      <span className="flex items-center gap-1 text-primary text-xs">
                        <Check className="size-3.5" /> Current
                      </span>
                    ) : null}
                  </div>
                  <p className="font-medium text-sm">
                    {entry.pricePerSeatCents === null
                      ? "Custom"
                      : entry.pricePerSeatCents === 0
                        ? "Free"
                        : `${usd(entry.pricePerSeatCents)}/seat/mo`}
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">{entry.blurb}</p>
                </div>
                <div className="mt-auto">
                  {isCurrent ? (
                    <Button variant="outline" size="sm" className="w-full" disabled>
                      Current plan
                    </Button>
                  ) : entry.plan === "enterprise" ? (
                    <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                      <a href="mailto:sales@basicsoftware.ai?subject=Basics%20Enterprise">
                        Contact sales <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  ) : entry.plan === "pro" || entry.plan === "team" ? (
                    canManageBilling ? (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={busy === entry.plan}
                        onClick={() => upgrade(entry.plan as "pro" | "team")}
                      >
                        {busy === entry.plan ? "Starting…" : `${hasStripeCustomer ? "Switch to" : "Upgrade to"} ${entry.name}`}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full" disabled>
                        Ask an owner
                      </Button>
                    )
                  ) : (
                    <Button variant="outline" size="sm" className="w-full" disabled>
                      {canManageBilling && hasStripeCustomer ? "Downgrade via Manage" : "—"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
