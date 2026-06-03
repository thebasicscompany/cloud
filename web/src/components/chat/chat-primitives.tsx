"use client";

import { ArrowUp, Sparkle } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { forwardRef, useEffect, useRef } from "react";
import type { JSX, KeyboardEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ChatRole = "user" | "assistant" | "system";

// Visual primitives inspired by the assistant-ui Perplexity example. They
// match the app's existing tokens (--foreground / --muted / --primary) so
// they drop into any surface (white card, gradient panel) without retuning.

export interface ChatThreadProps {
  children: ReactNode;
  className?: string;
  /** Keys to watch — when any change, the viewport auto-scrolls to bottom. */
  scrollKey?: unknown;
}

export const ChatThread = forwardRef<HTMLDivElement, ChatThreadProps>(function ChatThread(
  { children, className, scrollKey },
  forwardedRef,
) {
  const internalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    internalRef.current?.scrollTo({ top: internalRef.current.scrollHeight, behavior: "smooth" });
  }, [scrollKey]);
  return (
    <div
      ref={(node) => {
        internalRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      className={cn("flex-1 space-y-4 overflow-y-auto px-4 py-4", className)}
    >
      {children}
    </div>
  );
});

export interface ChatMessageProps {
  role: ChatRole;
  children: ReactNode;
  /** Avatar slot (defaults to a sparkle for assistant, nothing for user). */
  avatar?: ReactNode;
  /** Show a soft pulse on the avatar (typing/in-flight indicator). */
  pending?: boolean;
  className?: string;
}

export function ChatMessage({ role, children, avatar, pending, className }: ChatMessageProps) {
  if (role === "user") {
    return (
      <div className={cn("flex justify-end", className)}>
        <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground text-sm leading-snug shadow-sm">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex gap-3", className)}>
      <div
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-foreground/70",
          pending && "animate-pulse",
        )}
      >
        {avatar ?? <Sparkle weight="fill" className="size-3.5" />}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 whitespace-pre-wrap pt-1 text-foreground text-sm leading-relaxed",
          pending && "text-foreground/60",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Disables the send button independently from `disabled` (e.g. empty input). */
  sendDisabled?: boolean;
  rows?: number;
  /** Extra controls rendered above the textarea (suggested follow-ups, etc). */
  topSlot?: ReactNode;
  className?: string;
  /** When true, render the push-to-talk mic button next to send. Defaults true. */
  voice?: boolean;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Send a message",
  disabled,
  sendDisabled,
  rows = 1,
  topSlot,
  className,
  voice = true,
}: ChatComposerProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };
  const send = sendDisabled ?? !value.trim();
  // Voice dictation: append finalized transcripts to whatever's already in
  // the textarea so the user can dictate, then edit before sending. Interim
  // partials are ignored to avoid flicker.
  const onTranscript = (text: string, isFinal: boolean) => {
    if (!isFinal) return;
    const chunk = text.trim();
    if (!chunk) return;
    onChange(value ? `${value.trimEnd()} ${chunk}` : chunk);
  };
  return (
    <div className={cn("border-t bg-background/60 p-3 backdrop-blur-sm", className)}>
      {topSlot}
      <div className="flex items-end gap-2 rounded-2xl border bg-background p-1.5 shadow-sm transition-colors focus-within:border-foreground/30 focus-within:shadow-md">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 text-sm focus-visible:ring-0"
        />
        {voice && !disabled ? <ComposerVoiceButton onTranscript={onTranscript} /> : null}
        <Button
          type="button"
          onClick={onSubmit}
          disabled={disabled || send}
          size="icon"
          className="size-8 shrink-0 rounded-full"
          aria-label="Send"
        >
          <ArrowUp weight="bold" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// Dynamic import keeps the Deepgram WS + MediaRecorder code out of the bundle
// for callers that don't actually render the mic (chat-to-run, basics canvas,
// future agent surfaces — all opt in via voice={true|false}).
const ComposerVoiceButton = dynamic(
  () => import("@/app/(main)/_components/voice-button").then((m) => m.VoiceButton),
  { ssr: false, loading: () => null },
) as (props: { onTranscript: (text: string, isFinal: boolean) => void }) => JSX.Element;
