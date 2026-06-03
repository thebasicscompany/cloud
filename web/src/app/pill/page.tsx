"use client";

import { useEffect, useRef, useState } from "react";

import { Loader2, Mic, Square } from "@/icons";

/**
 * The floating Record/Teach HUD (Model: the demo's CaptureHUD). This page is
 * loaded in a frameless, always-on-top, transparent Electron window that sits
 * OVER the user's other apps - NOT anchored to the main window - so they can
 * demonstrate a workflow in their real apps while talking it through. Lens
 * captures screen/context; we capture the spoken narration (Deepgram); on Stop
 * the recorded routine is saved as a Document the agent can turn into an
 * automation. Deliberately minimal: dot + timer + Stop (+ mic state).
 */
const DG_WS_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true&punctuate=true";
const TIMESLICE_MS = 250;

interface PillBridge {
  isDesktop?: boolean;
  lensRecordStart?: (opts: { label?: string; workspaceId?: string; userId?: string }) => Promise<{ ok?: boolean; sessionId?: string; error?: string }>;
  lensRecordStop?: () => Promise<{ ok?: boolean; sessionId?: string; error?: string }>;
  captureScreen?: () => Promise<{ ok?: boolean; dataUrl?: string }>;
  closePill?: () => void;
}

const SHOT_INTERVAL_MS = 6000;
const MAX_SHOTS = 8;
function bridge(): PillBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { basichome?: PillBridge }).basichome;
}

export default function PillPage() {
  const [phase, setPhase] = useState<"starting" | "recording" | "saving" | "error">("starting");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);

  const startedAt = useRef(0);
  const narration = useRef("");
  const sessionId = useRef<string | null>(null);
  const shots = useRef<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Transparent backdrop so only the pill is visible over other apps.
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);

  function stopNarration() {
    try {
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function startNarration() {
    let token: string;
    try {
      const bh = (window as unknown as {
        basichome?: { isDesktop?: boolean; voiceCredentials?: () => Promise<{ ok?: boolean; token?: string }> };
      }).basichome;
      if (bh?.isDesktop && typeof bh.voiceCredentials === "function") {
        const r = await bh.voiceCredentials();
        if (!r?.ok || !r.token) throw new Error("no token");
        token = r.token;
      } else {
        const res = await fetch("/api/voice/token", { method: "POST" });
        const data = (await res.json()) as { ok?: boolean; token?: string };
        if (!res.ok || !data.ok || !data.token) throw new Error("no token");
        token = data.token;
      }
    } catch {
      return; // narration is best-effort
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return;
    }
    streamRef.current = stream;
    const ws = new WebSocket(DG_WS_URL, ["token", token]);
    wsRef.current = ws;
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    ws.onopen = () => {
      if (rec.state === "inactive") rec.start(TIMESLICE_MS);
      setMicOn(true);
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data as string) as {
          channel?: { alternatives?: { transcript?: string }[] };
          is_final?: boolean;
        };
        const t = d.channel?.alternatives?.[0]?.transcript;
        if (t && d.is_final) narration.current += (narration.current ? " " : "") + t;
      } catch {
        /* keepalive */
      }
    };
    ws.onclose = () => setMicOn(false);
  }

  // On mount: kick off Lens capture + narration.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bh = bridge();
      try {
        // Lens scopes the session to the current workspace + owner account.
        let ctx: { workspaceId?: string; userId?: string } = {};
        try {
          const res = await fetch("/api/lens/context");
          if (res.ok) ctx = await res.json();
        } catch {
          /* fall through - startRecording will surface a clear error */
        }
        const r = bh?.lensRecordStart
          ? await bh.lensRecordStart({ label: "Recorded routine", workspaceId: ctx.workspaceId, userId: ctx.userId })
          : { ok: false };
        if (r?.ok) sessionId.current = r.sessionId ?? null;
        else if (r?.error) setError(r.error);
      } catch {
        /* lens optional */
      }
      await startNarration();
      if (cancelled) return;
      startedAt.current = Date.now();
      setPhase("recording");
    })();
    return () => {
      cancelled = true;
      stopNarration();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Capture the screen periodically while recording - the visual half of the
  // demonstration. Capped + downscaled (in main.js) so it stays light.
  useEffect(() => {
    if (phase !== "recording") return;
    const bh = bridge();
    if (!bh?.captureScreen) return;
    let on = true;
    const grab = async () => {
      if (!on || shots.current.length >= MAX_SHOTS) return;
      try {
        const r = await bh.captureScreen!();
        if (on && r?.ok && r.dataUrl && shots.current.length < MAX_SHOTS) shots.current.push(r.dataUrl);
      } catch {
        /* best-effort */
      }
    };
    void grab();
    const id = setInterval(() => void grab(), SHOT_INTERVAL_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [phase]);

  async function stop() {
    setPhase("saving");
    stopNarration();
    try {
      await bridge()?.lensRecordStop?.();
    } catch {
      /* ignore */
    }
    // Bundle the narration + the screenshots into a routine Document and a prompt
    // the agent can act on (it opens the screenshot URLs to see what I did). Fall
    // back to a narration-only prompt if the bundling endpoint is unavailable.
    let prompt = `Turn this recorded routine into a reusable automation, then run it. Here's what I demonstrated and said out loud:\n\n${narration.current || "(no narration captured)"}`;
    try {
      const res = await fetch("/api/routines/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          narration: narration.current,
          screenshots: shots.current,
          minutes: Math.max(1, Math.round(elapsed / 60)),
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { prompt?: string };
        if (data?.prompt) prompt = data.prompt;
      }
    } catch {
      /* best-effort - narration-only prompt still hands off below */
    }
    // Hand the routine to the main window so the loop continues into building an
    // automation (same origin → shared localStorage; Home reads it on mount and
    // via a storage listener if already open).
    try {
      window.localStorage.setItem("basichome:routine-prompt", prompt);
    } catch {
      /* ignore */
    }
    bridge()?.closePill?.();
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center p-2">
      <div className="flex w-full items-center gap-3 rounded-full border bg-background/95 px-4 py-2.5 shadow-2xl backdrop-blur">
        {phase === "starting" ? (
          <>
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="text-sm">Starting capture…</span>
          </>
        ) : (
          <>
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-red-500" />
            </span>
            <span className="font-mono text-sm tabular-nums">
              {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
              {micOn ? "Teaching - demonstrate it and talk it through" : "Recording - demonstrate the workflow"}
            </span>
            <Mic className={micOn ? "size-4 text-red-500" : "size-4 text-muted-foreground/50"} />
            <button
              type="button"
              onClick={() => void stop()}
              disabled={phase === "saving"}
              className="flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-background text-xs"
            >
              {phase === "saving" ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3" />}
              {phase === "saving" ? "Saving" : "Stop"}
            </button>
          </>
        )}
      </div>
      {error ? (
        <div className="absolute bottom-0.5 left-2 right-2 truncate rounded bg-destructive/10 px-2 text-destructive text-[10px]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
