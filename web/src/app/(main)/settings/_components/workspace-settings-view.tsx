"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSettingsWorkspace } from "@/hooks/queries/use-settings-workspace";
import type { WorkspaceRole } from "@/types/settings";

const ROLE_VARIANT: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
};

export function WorkspaceSettingsView() {
  const { data, isLoading } = useSettingsWorkspace();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Workspace</h2>
        <p className="text-sm text-muted-foreground">Members and access for this workspace.</p>
      </div>

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full max-w-xl" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <>
          <Card size="sm" className="max-w-xl">
            <CardHeader className="border-b">
              <CardTitle>{data.workspace.name}</CardTitle>
              <CardDescription>
                Slug <span className="font-mono text-foreground">{data.workspace.slug || "-"}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">Type</span>
                <Badge variant="secondary" className="capitalize">{data.workspace.billing.planName}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">Members</span>
                <span className="text-sm tabular-nums">{data.members.length}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h3 className="font-medium text-sm">Members</h3>
            <div className="overflow-hidden rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.displayName}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant={ROLE_VARIANT[m.role]}>{m.role}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                        {formatDay(m.joinedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
