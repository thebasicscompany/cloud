"use client";

import { useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { Microphone, Monitor, Record, Square, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentDraftPatch } from "@/types/agent";

/**
 * "Record a demo" → draft an agent from what the user actually did.
 *
 * Flow:
 *   1. User clicks Start → we request display + mic; start MediaRecorder
 *      on the screen for narration, and start an interval that grabs frames
 *      from the display stream every 3s via OffscreenCanvas → base64 JPEG.
 *   2. While recording we accumulate frames in memory + a webkitSpeechRecognition
 *      transcript (where available). Counter ticks the elapsed time.
 *   3. User clicks Stop → we close streams, downsample frames to ≤24 evenly
 *      spaced across the recording, POST them with the transcript to
 *      /api/agents/draft-from-demo. The response is the same shape the
 *      Basics chat returns, so the parent canvas can apply it directly.
 *
 * No retries, no resume - keep it dead simple. If recording fails partway
 * we surface a toast and let the user start over.
 */
const FRAME_INTERVAL_MS = 3_000;
const FRAME_MAX = 24;
const JPEG_QUALITY = 0.55;
const FRAME_WIDTH = 1280; // downscale for token efficiency

// Live transcription via Deepgram. webkitSpeechRecognition silently fails in
// Electron's Chromium (no Google API key bundled), and the failure mode was
// invisible to the user - they'd record, talk, and the transcript would
// just be empty. Reuses the same realtime path the push-to-talk voice
// button uses; auth via short-lived workspace-scoped JWT.
const DG_WS_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true&punctuate=true";
const DG_TIMESLICE_MS = 250;

interface CapturedFrame {
  data: string;
  tSec: number;
  // Per-frame screen context from the Electron bridge (macOS only). Lets the
  // server-side draft prompt anchor each frame to "user is in Gmail" instead
  // of asking the model to read the chrome of every screenshot. Absent in
  // browser mode; the endpoint treats them as optional.
  appName?: string;
  windowTitle?: string;
  focusedUrl?: string;
}

interface BasichomeBridge {
  isDesktop?: boolean;
  captureContext?: () => Promise<{
    ok: boolean;
    appName?: string;
    windowTitle?: string;
    focusedUrl?: string;
    error?: string;
  }>;
}

interface DemoRecorderProps {
  open: boolean;
  onClose: () => void;
  onPatch: (patch: AgentDraftPatch, summary: string) => void;
}

export function DemoRecorder({ open, onClose, onPatch }: DemoRecorderProps) {
  const [phase, setPhase] = useState<"idle" | "recording" | "processing">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState("");
  const framesRef = useRef<CapturedFrame[]>([]);
  const startedAtRef = useRef<number>(0);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Deepgram realtime transcription. wsRef holds the open socket; recorderRef
  // holds the MediaRecorder that ships timeslices of audio into it. Both are
  // torn down by hardReset / stop.
  const wsRef = useRef<WebSocket | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!open) hardReset();
    return () => hardReset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function hardReset() {
    if (captureTimerRef.current) { clearInterval(captureTimerRef.current); captureTimerRef.current = null; }
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    try { displayStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    displayStreamRef.current = null;
    micStreamRef.current = null;
    try {
      const rec = audioRecorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    } catch { /* ignore */ }
    audioRecorderRef.current = null;
    try {
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    } catch { /* ignore */ }
    wsRef.current = null;
    framesRef.current = [];
    setElapsed(0);
    setTranscript("");
    setPhase("idle");
  }

  async function getDeepgramToken(): Promise<string | null> {
    try {
      const bh = (window as unknown as {
        basichome?: { isDesktop?: boolean; voiceCredentials?: () => Promise<{ ok?: boolean; token?: string }> };
      }).basichome;
      if (bh?.isDesktop && typeof bh.voiceCredentials === "function") {
        const r = await bh.voiceCredentials();
        return r?.ok && r.token ? r.token : null;
      }
      const res = await fetch("/api/voice/token", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string };
      return res.ok && data.ok && data.token ? data.token : null;
    } catch {
      return null;
    }
  }

  async function start() {
    try {
      // Mic FIRST so a denial fails fast and doesn't leave a screen-share
      // dialog half-open. Narration isn't optional here - the draft prompt
      // leans on the user's voice for intent ("I'm checking my unread Slack
      // DMs for things that need follow-up"). A silent recording asks the
      // model to read tea leaves; the result is much worse. If denied, send
      // the user to the System Settings deep-link via the Electron bridge
      // and bail.
      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = mic;
      } catch {
        const bh = (window as unknown as { basichome?: { permOpen?: (k: string) => Promise<unknown> } }).basichome;
        toast.error("Basics needs microphone access to record a demo - talk Basics through what you're doing.", {
          action: bh?.permOpen
            ? { label: "Open Settings", onClick: () => void bh.permOpen!("microphone") }
            : undefined,
        });
        hardReset();
        return;
      }
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      displayStreamRef.current = display;

      // Drive an offscreen <video> with the display stream so we can paint
      // frames from it without rendering it in the page.
      const v = document.createElement("video");
      v.muted = true;
      v.srcObject = display;
      await v.play().catch(() => undefined);
      videoElRef.current = v;

      framesRef.current = [];
      startedAtRef.current = Date.now();
      setElapsed(0);
      setTranscript("");

      // Live transcript via Deepgram WS. Mint a short-lived workspace-scoped
      // token, open the realtime listen socket, stream MediaRecorder chunks
      // through. is_final segments get appended to the transcript so the
      // user can SEE it being captured in the dialog as they talk - that's
      // the visible "yes this is recording your voice" feedback. If the
      // token mint or socket open fails we toast it explicitly so we don't
      // silently record without transcription (the bug we just had).
      const token = await getDeepgramToken();
      if (!token) {
        toast.warning("Voice transcription unavailable - the recording will still capture frames.");
      } else {
        try {
          const ws = new WebSocket(DG_WS_URL, ["bearer", token]);
          wsRef.current = ws;
          ws.onopen = () => {
            try {
              const rec = new MediaRecorder(mic, { mimeType: "audio/webm" });
              audioRecorderRef.current = rec;
              rec.ondataavailable = (ev) => {
                if (ev.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(ev.data);
              };
              rec.start(DG_TIMESLICE_MS);
            } catch (err) {
              toast.warning(`Voice transcription couldn't start: ${err instanceof Error ? err.message : "unknown"}`);
            }
          };
          ws.onmessage = (ev) => {
            try {
              const data = JSON.parse(ev.data as string) as {
                channel?: { alternatives?: { transcript?: string }[] };
                is_final?: boolean;
              };
              const t = data.channel?.alternatives?.[0]?.transcript;
              if (t && data.is_final) {
                setTranscript((prev) => (prev ? `${prev.trimEnd()} ${t}` : t));
              }
            } catch { /* keepalive / non-JSON */ }
          };
          ws.onerror = () => {
            toast.warning("Voice transcription dropped mid-recording.");
          };
        } catch (err) {
          toast.warning(`Voice transcription unavailable: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }

      // Grab the first frame immediately, then on interval.
      void grabFrame();
      captureTimerRef.current = setInterval(() => {
        void grabFrame();
      }, FRAME_INTERVAL_MS);
      tickTimerRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 1_000);

      // If user clicks "Stop sharing" in Chrome's bar, end the recording too.
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (phase === "recording") void stop();
      });

      setPhase("recording");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start screen recording.");
      hardReset();
    }
  }

  async function grabFrame() {
    const v = videoElRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, FRAME_WIDTH / v.videoWidth);
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const dataUrl = c.toDataURL("image/jpeg", JPEG_QUALITY);
    const b64 = dataUrl.split(",", 2)[1] ?? "";
    if (!b64) return;
    const tSec = (Date.now() - startedAtRef.current) / 1000;
    // Best-effort per-frame metadata via the Electron bridge. Runs in parallel
    // with the JPEG encode so it doesn't extend frame interval. Missing or
    // failed metadata just ships the frame without it.
    let ctx_app: { appName?: string; windowTitle?: string; focusedUrl?: string } = {};
    const bh = (window as unknown as { basichome?: BasichomeBridge }).basichome;
    if (bh?.captureContext) {
      try {
        const r = await bh.captureContext();
        if (r?.ok) {
          ctx_app = {
            appName: r.appName || undefined,
            windowTitle: r.windowTitle || undefined,
            focusedUrl: r.focusedUrl || undefined,
          };
        }
      } catch {
        // ignore - frame ships without metadata
      }
    }
    framesRef.current.push({ data: b64, tSec, ...ctx_app });
  }

  async function stop() {
    if (phase !== "recording") return;
    setPhase("processing");
    if (captureTimerRef.current) { clearInterval(captureTimerRef.current); captureTimerRef.current = null; }
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    try { displayStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { micStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try {
      const rec = audioRecorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    } catch { /* ignore */ }
    try {
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    } catch { /* ignore */ }

    // Evenly subsample frames to FRAME_MAX so the model gets a coherent
    // timeline even if the user recorded for a long time.
    const all = framesRef.current;
    let frames = all;
    if (all.length > FRAME_MAX) {
      const step = (all.length - 1) / (FRAME_MAX - 1);
      frames = Array.from({ length: FRAME_MAX }, (_, i) => all[Math.round(i * step)]!).filter(Boolean);
    }

    try {
      const r = await fetch("/api/agents/draft-from-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: transcript.trim(), frames }),
      });
      const data = (await r.json().catch(() => ({}))) as { reply?: string; patch?: AgentDraftPatch; error?: string; message?: string };
      if (!r.ok) {
        toast.error(data.error ?? data.message ?? "Couldn't draft from your demo.");
        setPhase("idle");
        return;
      }
      onPatch(data.patch ?? {}, data.reply ?? "Drafted from your demo.");
      hardReset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reach the drafting API.");
      setPhase("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a demo</DialogTitle>
          <DialogDescription>
            Show Basics what to do - share your screen and talk through the task. We&apos;ll draft the agent
            from what you did and said.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border bg-foreground/[0.02] p-3 text-sm">
            <Monitor weight="fill" className="size-4 shrink-0 text-foreground/70" />
            Screen share will start when you press Record.
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-foreground/[0.02] p-3 text-sm">
            <Microphone weight="fill" className="size-4 shrink-0 text-foreground/70" />
            Talk through what you're doing - Basics uses your voice to infer intent.
          </div>

          {phase === "recording" ? (
            <div className="flex items-center justify-between rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-destructive" />
                <span className="font-medium">Recording…</span>
                <span className="text-foreground/60">{formatElapsed(elapsed)}</span>
              </div>
              <div className="text-foreground/60 text-xs">{framesRef.current.length} frames</div>
            </div>
          ) : null}

          {transcript ? (
            <div className="max-h-32 overflow-y-auto rounded-lg border bg-card p-3 text-sm">
              <div className="mb-1 text-foreground/60 text-xs">Transcript</div>
              {transcript}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {phase === "idle" ? (
            <>
              <Button variant="ghost" onClick={onClose} className="gap-1.5">
                <X className="size-4" /> Cancel
              </Button>
              <Button onClick={() => void start()} className="gap-1.5">
                <Record weight="fill" className="size-4" /> Record
              </Button>
            </>
          ) : phase === "recording" ? (
            <Button onClick={() => void stop()} variant="destructive" className="gap-1.5">
              <Square weight="fill" className="size-4" /> Stop &amp; draft
            </Button>
          ) : (
            <Button disabled className="gap-1.5">
              Drafting…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
