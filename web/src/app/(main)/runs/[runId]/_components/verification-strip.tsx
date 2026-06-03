"use client";

import { CheckCircle2, ShieldCheck, XCircle } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunSteps } from "@/hooks/queries/use-runs";
import type { CheckResult, Run } from "@/types/runs";

export function VerificationStrip({ run }: { run: Run }) {
  const { data: steps, isLoading } = useRunSteps(run.id);

  // Verification checks are REAL run steps (payload.kind === "check") the
  // worker emits - no separate mock check fixture.
  const checks: CheckResult[] = (steps ?? [])
    .filter((s) => s.payload.kind === "check")
    .map((s) => {
      const p = s.payload as Extract<typeof s.payload, { kind: "check" }>;
      return { name: p.checkName, passed: p.passed, message: p.passed ? "Passed" : "Failed", evidence: p.evidence };
    });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-7 w-32" />
      </div>
    );
  }

  if (checks.length === 0) {
    return (
      <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-2.5 text-muted-foreground text-xs">
        <ShieldCheck className="size-3.5" />
        No verification checks recorded for this run.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-2.5">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
        <ShieldCheck className="size-3.5" />
        Verification
      </span>
      {checks.map((c) => (
        <Badge
          key={c.name}
          title={c.message}
          variant={c.passed ? "secondary" : "destructive"}
          className="h-auto min-h-5 gap-1.5 py-1 font-normal [&>svg]:!size-3.5"
        >
          {c.passed ? <CheckCircle2 /> : <XCircle />}
          <code className="font-mono text-[11px]">{c.name}</code>
        </Badge>
      ))}
    </div>
  );
}
