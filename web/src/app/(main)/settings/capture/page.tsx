"use client";

import { useCallback, useEffect, useState } from "react";

import { Eye, Lock, Monitor, ShieldCheck } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * Settings → Capture. Controls the Lens capture engine that ships WITH the
 * basichome desktop app (one download). Always-on background capture powers
 * passive automation suggestions; the floating pill records explicit "teach"
 * routines. Everything is local — nothing leaves the device unless approved.
 * Renders graceful states off-desktop / when the bundled engine isn't present.
 */
interface CaptureStatus {
  supported?: boolean;
  installed?: boolean;
  running?: boolean;
  recording?: boolean;
  reason?: string;
}
interface CaptureBridge {
  isDesktop?: boolean;
  lensStatus?: () => Promise<CaptureStatus>;
  lensAlwaysOn?: () => Promise<{ ok?: boolean }>;
  lensStopCapture?: () => Promise<{ ok?: boolean }>;
  openPill?: () => void;
}
function bridge(): CaptureBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { basichome?: CaptureBridge }).basichome;
}

export default function CaptureSettingsPage() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const bh = bridge();
    if (!bh?.lensStatus) return;
    try {
      setStatus(await bh.lensStatus());
    } catch {
      setStatus({ supported: false });
    }
  }, []);

  useEffect(() => {
    const bh = bridge();
    setIsDesktop(Boolean(bh?.isDesktop));
    void refresh();
  }, [refresh]);

  const toggleAlwaysOn = async (on: boolean) => {
    const bh = bridge();
    if (!bh) return;
    setBusy(true);
    try {
      if (on) await bh.lensAlwaysOn?.();
      else await bh.lensStopCapture?.();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-semibold text-lg">
          <Eye className="size-5" />
          Capture
        </h2>
        <p className="text-muted-foreground text-sm">
          Lens watches your screen <span className="font-medium">on this device</span> so basichome can
          suggest automations and learn routines you record. Nothing it sees ever leaves your computer.
        </p>
      </div>

      {!isDesktop ? (
        <Note icon={Monitor} title="Capture runs in the desktop app">
          Open basichome on your Mac or Windows desktop to enable on-device capture. The web view manages everything
          else, but capture needs the local Lens engine.
        </Note>
      ) : !status?.supported ? (
        <Note icon={Monitor} title="Not supported on this platform">
          The Lens capture engine supports macOS, Windows, and Linux desktops.
        </Note>
      ) : !status?.installed ? (
        <Note icon={ShieldCheck} title="Lens engine not detected">
          Lens ships with basichome but isn&apos;t present on this machine yet. Once the bundled engine is in place,
          background capture and routine recording turn on here.
        </Note>
      ) : (
        <>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">Background capture</h3>
                  <Badge variant={status.running ? "secondary" : "outline"}>
                    {status.running ? "On" : "Off"}
                  </Badge>
                  {status.recording ? <Badge>Recording routine</Badge> : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  Runs quietly in the background and suggests automations over time. It doesn&apos;t use any
                  AI credits while watching.
                </p>
              </div>
              <Switch
                checked={Boolean(status.running)}
                disabled={busy}
                onCheckedChange={(v) => void toggleAlwaysOn(v)}
                aria-label="Background capture"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
            <div className="space-y-1">
              <h3 className="font-medium text-sm">Record a routine</h3>
              <p className="text-muted-foreground text-sm">
                Open the recorder, show basichome a task in your apps while talking it through, and it saves
                it as a routine your agent can turn into an automation.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => bridge()?.openPill?.()}>
              <span className="size-2.5 rounded-full bg-red-500" />
              Record
            </Button>
          </div>
        </>
      )}

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1 text-sm">
            <h3 className="font-medium">What leaves this device</h3>
            <p className="text-muted-foreground">
              Nothing raw. Screenshots, text, and audio stay on this device. Only summaries or routines you
              approve can sync, and your agent only ever sees this workspace&apos;s data, never another&apos;s.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Note({ icon: Icon, title, children }: { icon: typeof Monitor; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          <p className="text-muted-foreground text-sm">{children}</p>
        </div>
      </div>
    </div>
  );
}
