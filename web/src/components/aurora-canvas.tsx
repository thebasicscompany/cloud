"use client";

import { cn } from "@/lib/utils";

/**
 * Subtle brand-green gradient — same emerald palette as the auth/login
 * brand panel (#23ab68 / #168350 / #093d28) with a soft mint glow drifting
 * slowly across it. Animated via background-position shift + a single
 * floating highlight; deliberately calm so it doesn't compete with the
 * cards on top.
 */
export function AuroraCanvas({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden",
        className,
      )}
    >
      {/* Base brand gradient — same recipe as the auth brand panel. */}
      <div className="brand-gradient" />
      {/* Single soft mint highlight that drifts slowly for the moving feel. */}
      <div className="mint-glow" />
      <style jsx>{`
        .brand-gradient {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            140deg,
            #23ab68 0%,
            #168350 46%,
            #093d28 100%
          );
          background-size: 200% 200%;
          animation: shift 28s ease-in-out infinite alternate;
        }
        .mint-glow {
          position: absolute;
          inset: -20%;
          background: radial-gradient(45% 45% at 50% 50%, #5ff0a8 0%, transparent 65%);
          filter: blur(60px);
          opacity: 0.4;
          will-change: transform;
          animation: drift 36s ease-in-out infinite alternate;
        }
        @keyframes shift {
          0%   { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
        @keyframes drift {
          0%   { transform: translate3d(-10%, -8%, 0) scale(0.9); }
          100% { transform: translate3d(12%, 10%, 0) scale(1.2); }
        }
      `}</style>
    </div>
  );
}
