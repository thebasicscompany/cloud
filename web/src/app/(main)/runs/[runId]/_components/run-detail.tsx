"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { OrbitRing } from "@/components/ui/orbit-ring";
import { useRun } from "@/hooks/queries/use-runs";

import { ConnectionNeededBanner } from "./connection-needed-banner";
import { LiveView } from "./live-view";
import { RunHeader } from "./run-header";
import { RunMessageBox } from "./run-message-box";
import { Timeline } from "./timeline";
import { VerificationStrip } from "./verification-strip";

const LIVE_STATUSES = new Set([
  "pending",
  "booting",
  "running",
  "paused",
  "paused_by_user",
  "verifying",
]);

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
        <button
          type="button"
          className="text-primary text-sm hover:underline"
          onClick={() => push("/runs")}
        >
          ← Back to runs
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RunHeader
        run={run}
        takeover={takeover}
        onToggleTakeover={() => setTakeover((v) => !v)}
        paused={paused}
        onTogglePause={() => setPaused((v) => !v)}
      />

      <ConnectionNeededBanner runId={run.id} />

      {takeover ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="h-[calc(100vh-12rem)]">
            <LiveView run={run} takeover fullBleed onToggleTakeover={() => setTakeover(false)} />
          </div>
        </div>
      ) : (
        <div className="h-[calc(100vh-16rem)] min-h-[480px] overflow-hidden rounded-lg border bg-card">
          <ResizablePanelGroup orientation="horizontal" className="h-full overflow-hidden">
            <ResizablePanel defaultSize={36} minSize={24} className="min-h-0 overflow-hidden">
              <Timeline runId={run.id} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={64} minSize={40} className="min-h-0 overflow-hidden">
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  <LiveView run={run} takeover={false} onToggleTakeover={() => setTakeover(true)} />
                </div>
                <VerificationStrip run={run} />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      <RunMessageBox runId={run.id} isLive={LIVE_STATUSES.has(run.status)} />
    </div>
  );
}
