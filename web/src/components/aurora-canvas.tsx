"use client";

import { cn } from "@/lib/utils";

/**
 * Basics-brand emerald gradient. Stays in the brand range (#23ab68 +
 * #168350) with a soft mint highlight (#5ff0a8) for lift — explicitly NO
 * near-black stops. Drifts slowly so the surface has gentle motion.
 */
export function AuroraCanvas({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative isolate overflow-hidden aurora-bg", className)}
      style={{
        background:
          "linear-gradient(140deg, #2cc47e 0%, #23ab68 35%, #1c9259 70%, #168350 100%)",
        backgroundSize: "180% 180%",
      }}
    >
      <div className="mint-glow" />
      <div className="sheen" />
      <style jsx global>{`
        .aurora-bg {
          animation: aurora-shift 28s ease-in-out infinite alternate;
        }
        @keyframes aurora-shift {
          0%   { background-position: 0% 30%; }
          100% { background-position: 100% 70%; }
        }
      `}</style>
      <style jsx>{`
        .mint-glow {
          position: absolute;
          inset: -20%;
          background: radial-gradient(45% 45% at 50% 50%, #b6f8d8 0%, #5ff0a8 35%, transparent 65%);
          filter: blur(70px);
          opacity: 0.55;
          will-change: transform;
          animation: mint-drift 32s ease-in-out infinite alternate;
        }
        .sheen {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(255,255,255,0.18) 0%,
            rgba(255,255,255,0.04) 40%,
            rgba(255,255,255,0)    65%,
            rgba(255,255,255,0.06) 100%
          );
          pointer-events: none;
        }
        @keyframes mint-drift {
          0%   { transform: translate3d(-15%, -10%, 0) scale(0.85); }
          100% { transform: translate3d(15%, 12%, 0)  scale(1.3); }
        }
      `}</style>
    </div>
  );
}
