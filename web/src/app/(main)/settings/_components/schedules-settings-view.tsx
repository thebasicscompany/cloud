"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCloudAutomations } from "@/hooks/queries/use-cloud-automations";
import { formatCron } from "@/lib/format";
import type { CloudAutomationTrigger } from "@/types/cloud-automation";

type ScheduleRow = { id: string; name: string; cron: string; timezone: string; enabled: boolean };

export function SchedulesSettingsView() {
  const { data, isLoading } = useCloudAutomations();
  const rows: ScheduleRow[] = (data ?? [])
    .map((a) => {
      const sched = a.triggers.find(
        (t): t is Extract<CloudAutomationTrigger, { type: "schedule" }> => t.type === "schedule",
      );
      if (!sched) return null;
      return { id: a.id, name: a.name, cron: sched.cron, timezone: sched.timezone, enabled: a.status === "active" };
    })
    .filter((r): r is ScheduleRow => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Schedules</h2>
        <p className="text-sm text-muted-foreground">
          Automations that run on a timer. Open one to change when it runs.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Automation</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 3 }).map((_x, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground text-sm">
                  No scheduled automations yet. Set up an automation and give it a schedule.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatCron(row.cron)} · {row.timezone}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <Badge variant={row.enabled ? "default" : "secondary"}>{row.enabled ? "On" : "Off"}</Badge>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <Link href={`/automations/${row.id}`} prefetch={false}>Open</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
