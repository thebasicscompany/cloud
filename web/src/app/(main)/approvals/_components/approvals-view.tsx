"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isPendingApproval, useApprovalStore, useApprovals } from "@/hooks/queries/use-approvals";

import { PendingCard } from "./pending-card";
import { ResolvedTable } from "./resolved-table";

export function ApprovalsView() {
  const { data, isLoading } = useApprovals();
  const { data: store } = useApprovalStore();
  const approvals = data ?? [];
  const pending = approvals.filter(isPendingApproval);
  const approved = approvals.filter((approval) => approval.status === "approved");
  const changes = approvals.filter((approval) => approval.status === "changes_requested");
  const rejected = approvals.filter((approval) => approval.status === "rejected" || approval.status === "expired" || approval.status === "revoked");
  const activeTrustGrants = store?.trustGrants.filter((grant) => grant.status === "active").length ?? 0;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Pending" value={pending.length.toString()} detail="Waiting for your decision." />
        <SummaryCard label="Approved" value={approved.length.toString()} detail="Decisions you've signed off on." />
        <SummaryCard label="Auto-approved" value={activeTrustGrants.toString()} detail="Actions allowed without asking." />
        <SummaryCard label="Blocked" value={(changes.length + rejected.length).toString()} detail="Declined, expired, or revoked." />
      </section>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {pending.length > 0 && (
              <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 tabular-nums">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            Approved
            <span className="text-muted-foreground tabular-nums">{approved.length}</span>
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-2">
            Resolved
            <span className="text-muted-foreground tabular-nums">{approvals.length - pending.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-lg" />
              ))}
            </div>
          ) : pending.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center">
              <p className="font-medium text-sm">All caught up.</p>
              <p className="mt-1 text-muted-foreground text-sm">Nothing needs your approval right now.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {pending.map((approval) => (
                <PendingCard key={approval.id} approval={approval} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {approved.map((approval) => (
              <PendingCard key={approval.id} approval={approval} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="resolved">
          <ResolvedTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card size="sm">
      <CardHeader className="space-y-0">
        <CardTitle className="text-muted-foreground text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-semibold text-2xl tabular-nums">{value}</div>
        <p className="mt-1 text-muted-foreground text-xs">{detail}</p>
      </CardContent>
    </Card>
  );
}
