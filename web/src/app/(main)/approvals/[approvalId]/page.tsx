import type { Metadata } from "next";
import Link from "next/link";

import { ApprovalDetailPage } from "../_components/approval-detail-page";

export const metadata: Metadata = {
  title: "Approval | basichome",
  description: "Approval detail with requested data, apps, tools, domains, target, cost, and audit record.",
};

export default async function ApprovalDetailRoute({
  params,
}: {
  params: Promise<{ approvalId: string }>;
}) {
  const { approvalId } = await params;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href="/approvals" prefetch={false} className="text-muted-foreground text-sm hover:text-foreground">
          Approvals
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Approval detail</h1>
      </header>
      <ApprovalDetailPage approvalId={approvalId} />
    </div>
  );
}
