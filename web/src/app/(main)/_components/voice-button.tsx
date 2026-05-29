"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Mic } from "@/icons";

import { Button } from "@/components/ui/button";

const DG_WS_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true&punctuate=true";
const TIMESLICE_MS = 250;

type VoiceButtonProps = {
  /** Called for every transcript chunk; `isFinal` marks Deepgram's finalized segments. */
  onTranscript: (text: string, isFinal: boolean) => void;
};

/**
 * Push-to-talk mic button. On click it mints a short-lived Deepgram token from
 * `/api/voice/token`, opens a realtime STT WebSocket directly to Deepgram (auth
 * via the `["token", <jwt>]` WS subprotocol), and streams mic audio captured by
 * `MediaRecorder`. Clicking again stops everything. Mic-permission and token
 * failures surface as a small inline message instead of crashing.
 */
export function VoiceButton({ onTranscript }: VoiceButtonProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Latest onTranscript without re-running effects/handlers.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const cleanup = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore — recorder may already be stopping
      }
    }
    recorderRef.current = null;

    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close();
      } catch {
        // ignore — socket may already be closed
      }
    }
    wsRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamRef.current = null;
  }, []);

  // Stop everything if the component unmounts mid-recording.
  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(() => {
    cleanup();
    setRecording(false);
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);

    let token: string;
    try {
      const res = await fetch("/api/voice/token", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; token?: string };
      if (!res.ok || !data.ok || !data.token) {
        throw new Error("token unavailable");
      }
      token = data.token;
    } catch {
      setError("Voice is unavailable right now.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was denied.");
      return;
    }
    streamRef.current = stream;

    let ws: WebSocket;
    try {
      ws = new WebSocket(DG_WS_URL, ["token", token]);
    } catch {
      cleanup();
      setError("Could not connect to voice service.");
      return;
    }
    wsRef.current = ws;

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    } catch {
      cleanup();
      setError("Voice recording is not supported here.");
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(event.data);
      }
    };

    ws.onopen = () => {
      if (recorder.state === "inactive") recorder.start(TIMESLICE_MS);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          channel?: { alternatives?: { transcript?: string }[] };
          is_final?: boolean;
        };
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        if (transcript) {
          onTranscriptRef.current(transcript, Boolean(data.is_final));
        }
      } catch {
        // ignore non-JSON / keepalive frames
      }
    };

    ws.onerror = () => {
      setError("Voice connection error.");
      stop();
    };

    ws.onclose = () => {
      // If the socket drops on its own, reflect that in the UI.
      if (wsRef.current === ws) stop();
    };

    setRecording(true);
  }, [cleanup, stop]);

  const toggle = useCallback(() => {
    if (recording) stop();
    else void start();
  }, [recording, start, stop]);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="icon"
        variant={recording ? "destructive" : "outline"}
        aria-pressed={recording}
        aria-label={recording ? "Stop voice input" : "Start voice input"}
        title={recording ? "Stop voice input" : "Talk to the agent"}
        onClick={toggle}
        className="relative"
      >
        <Mic className="size-4" />
        {recording ? (
          <span className="absolute -top-0.5 -right-0.5 flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-red-500" />
          </span>
        ) : null}
      </Button>
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </div>
  );
}
