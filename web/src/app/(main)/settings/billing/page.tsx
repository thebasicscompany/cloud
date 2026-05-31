import { getBilling } from "@/lib/billing-data";

import { BillingPanel } from "./_components/billing-panel";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const billing = await getBilling();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 py-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Your workspace plan, included-AI usage and seats. Billing is per workspace.
        </p>
      </header>
      <BillingPanel billing={billing} />
    </div>
  );
}
