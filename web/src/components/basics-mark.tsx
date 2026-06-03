import Image from "next/image";

import { cn } from "@/lib/utils";

interface BasicsMarkProps {
  className?: string;
  /** When true, applies a soft pulse + glow to convey "Basics is thinking". */
  pending?: boolean;
  /** Pixel size of the rendered logo. Default 14 to match the previous
   *  `size-3.5` Sparkle it replaces. */
  size?: number;
}

/**
 * The Basics wordmark glyph. Used anywhere we previously rendered a Sparkle
 * to identify a Basics-authored message or surface. `pending` adds a gentle
 * pulse so it visibly "breathes" while the assistant is drafting.
 */
export function BasicsMark({ className, pending = false, size = 14 }: BasicsMarkProps) {
  return (
    <span
      className={cn(
        "relative inline-block shrink-0",
        pending && "animate-[basics-pulse_1.6s_ease-in-out_infinite]",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Image
        src="/basics-logo.png"
        alt=""
        width={size}
        height={size}
        priority={false}
        className="block h-full w-full select-none"
      />
    </span>
  );
}
