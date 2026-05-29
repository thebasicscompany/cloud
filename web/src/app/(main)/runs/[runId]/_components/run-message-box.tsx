"use client";

import { useState } from "react";

import Link from "next/link";

import { ArrowUp, Loader2, MessageSquare } from "@/icons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SendResult =
  | { mode: "steer" }
  | { mode: "followup"; runId?: string }
  | { error: string };

/**
 * Compact "message the agent" composer for a run.
 *
 * For a LIVE run it steers the running session (the message is delivered as a
 * follow-up turn). For a finished run it starts a follow-up run that references
 * the original. Both go through POST /api/runs/[id]/message.
 */
export function RunMessageBox({ runId, isLive }: { runId: string; isLive: boolean }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function send() {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/runs/${runId}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; mode?: "steer" | "followup"; runId?: string; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        setResult({ error: data?.error ?? "Couldn't reach the agent. Try again." });
      } else if (data.mode === "followup") {
        setResult({ mode: "followup", runId: data.runId });
        setMessage("");
      } else {
        setResult({ mode: "steer" });
        setMessage("");
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Network error." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2">
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={sending}
          placeholder={isLive ? "Message the agent…" : "Send a follow-up instruction…"}
          className="h-7 border-0 bg-transparent px-0 focus-visible:ring-0"
          aria-label="Message the agent"
        />
        <Button
          size="sm"
          onClick={() => void send()}
          disabled={sending || message.trim().length === 0}
          className="h-7 shrink-0 gap-1.5"
        >
          {sending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ArrowUp className="size-3.5" />
          )}
          {isLive ? "Send" : "Follow up"}
        </Button>
      </div>

      {result && "error" in result && (
        <p className="px-1 text-destructive text-xs">{result.error}</p>
      )}
      {result && "mode" in result && result.mode === "steer" && (
        <p className="px-1 text-muted-foreground text-xs">Sent to the agent.</p>
      )}
      {result && "mode" in result && result.mode === "followup" && (
        <p className="px-1 text-muted-foreground text-xs">
          Started a follow-up run.{" "}
          {result.runId ? (
            <Link href={`/runs/${result.runId}`} className="text-primary hover:underline">
              View it →
            </Link>
          ) : null}
        </p>
      )}
    </div>
  );
}
