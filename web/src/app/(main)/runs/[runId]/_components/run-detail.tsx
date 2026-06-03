"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { OrbitRing } from "@/components/ui/orbit-ring";
import { useRun } from "@/hooks/queries/use-runs";

import { ConnectionNeededBanner } from "./connection-needed-banner";
import { LiveView } from "./live-view";
import { RunHeader } from "./run-header";
import { RunOutputs } from "./run-outputs";
import { RunMessageBox } from "./run-message-box";
import { VerificationStrip } from "./verification-strip";

const LIVE_STATUSES = new Set(["pending", "booting", "running", "paused", "paused_by_user", "verifying"]);

export function RunDetail({ runId }: { runId: string }) {
  const { push } = useRouter();
  const { data: run, isLoading } = useRun(runId);
  const [takeover, setTakeover] = useState(false);
  const [paused, setPaused] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <OrbitRing className="mr-2" />
        Loading run…
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="font-semibold text-lg">Run not found</h2>
        <p className="text-muted-foreground text-sm">This run id doesn't match anything in your workspace.</p>
        <button type="button" className="text-primary text-sm hover:underline" onClick={() => push("/runs")}>
          ← Back to runs
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <RunHeader
        run={run}
        takeover={takeover}
        onToggleTakeover={() => setTakeover((v) => !v)}
        paused={paused}
        onTogglePause={() => setPaused((v) => !v)}
      />

      <ConnectionNeededBanner runId={run.id} />

      {/* Live view is the centerpiece. We dropped the timeline/log panel — the
       *  verification strip surfaces anything that needs human attention inline. */}
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className={takeover ? "h-[calc(100vh-12rem)]" : "h-[calc(100vh-22rem)] min-h-[420px]"}>
          <LiveView
            run={run}
            takeover={takeover}
            fullBleed={takeover}
            onToggleTakeover={() => setTakeover((v) => !v)}
          />
        </div>
        <VerificationStrip run={run} />
      </div>

      <RunOutputs run={run} />

      <RunMessageBox runId={run.id} isLive={LIVE_STATUSES.has(run.status)} />
    </div>
  );
}
