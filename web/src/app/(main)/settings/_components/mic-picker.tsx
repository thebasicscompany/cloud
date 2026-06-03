"use client";

import { useCallback, useEffect, useState } from "react";

import { Microphone } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  getPreferredMicDeviceId,
  setPreferredMicDeviceId,
} from "@/lib/preferred-mic";

/**
 * Audio-input picker for the settings profile. Lists the user's microphones
 * via `enumerateDevices()` and persists the choice through
 * `lib/preferred-mic`. `voice-button` and `demo-recorder` honor the saved
 * id when they call getUserMedia.
 *
 * One quirk: device LABELS are only exposed after the user has granted
 * mic permission at least once. Before that, `enumerateDevices()` returns
 * entries with empty labels. So we offer an "Allow mic" button that runs
 * a quick getUserMedia / immediately-stop dance to unlock labels.
 */
export function MicPicker() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [needsPermission, setNeedsPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === "audioinput");
      setDevices(mics);
      const allBlank = mics.length > 0 && mics.every((m) => !m.label);
      setNeedsPermission(allBlank);
      const saved = getPreferredMicDeviceId();
      if (saved && mics.some((m) => m.deviceId === saved)) {
        setSelected(saved);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not list microphones.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Devicechange fires when the user plugs/unplugs - keep the list fresh
    // while this view is mounted.
    const handler = () => void refresh();
    navigator.mediaDevices.addEventListener?.("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", handler);
  }, [refresh]);

  async function grantThenRefresh() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of stream.getTracks()) t.stop();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic access was denied.");
    }
  }

  function onChange(id: string) {
    setSelected(id);
    setPreferredMicDeviceId(id || null);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Microphone weight="fill" className="size-4 text-foreground/70" />
        <Label className="text-sm font-medium">Microphone</Label>
      </div>
      <p className="text-foreground/55 text-xs">
        Used for voice mode and Record a demo. Saved to this device.
      </p>

      {needsPermission ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <span className="text-foreground/80">Allow mic access to see device names.</span>
          <Button size="sm" onClick={() => void grantThenRefresh()}>
            Allow
          </Button>
        </div>
      ) : null}

      <NativeSelect
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
        disabled={devices.length === 0}
        aria-label="Microphone"
      >
        <NativeSelectOption value="">System default</NativeSelectOption>
        {devices.map((d) => (
          <NativeSelectOption key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
