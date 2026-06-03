"use client";

import { cn } from "@/lib/utils";

/**
 * Soft, slowly-animating green aurora — the "alive cloud" backdrop for the
 * Create Agent canvas. Pure CSS (no JS), no GPU pegging: 3 layered conic /
 * radial gradients drifting in opposite directions over 30s. Brand green
 * (--chart-2) mixed with paper-white so it reads as a calm surface, not noise.
 */
export function AuroraCanvas({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="aurora-layer aurora-a absolute inset-0" />
      <div className="aurora-layer aurora-b absolute inset-0" />
      <div className="aurora-layer aurora-c absolute inset-0" />
      <div className="absolute inset-0 bg-white/30 backdrop-blur-3xl" />
      <style jsx>{`
        .aurora-layer {
          will-change: transform;
        }
        .aurora-a {
          background:
            radial-gradient(60% 80% at 30% 30%, color-mix(in oklab, var(--chart-2) 55%, white) 0%, transparent 60%),
            radial-gradient(70% 60% at 80% 70%, color-mix(in oklab, var(--chart-2) 35%, white) 0%, transparent 65%);
          animation: drift-a 32s ease-in-out infinite alternate;
        }
        .aurora-b {
          background:
            radial-gradient(50% 60% at 70% 20%, color-mix(in oklab, var(--chart-2) 45%, white) 0%, transparent 55%),
            radial-gradient(60% 70% at 20% 80%, color-mix(in oklab, white 65%, var(--chart-2)) 0%, transparent 60%);
          mix-blend-mode: screen;
          animation: drift-b 38s ease-in-out infinite alternate;
        }
        .aurora-c {
          background:
            radial-gradient(80% 50% at 50% 50%, color-mix(in oklab, white 75%, var(--chart-2)) 0%, transparent 70%);
          animation: drift-c 26s ease-in-out infinite alternate;
        }
        @keyframes drift-a {
          0% { transform: translate3d(-4%, -3%, 0) scale(1.05); }
          100% { transform: translate3d(6%, 4%, 0) scale(1.15); }
        }
        @keyframes drift-b {
          0% { transform: translate3d(5%, 2%, 0) scale(1.1); }
          100% { transform: translate3d(-6%, -4%, 0) scale(1.0); }
        }
        @keyframes drift-c {
          0% { transform: translate3d(0, 0, 0) scale(1.0); }
          100% { transform: translate3d(2%, -3%, 0) scale(1.2); }
        }
      `}</style>
    </div>
  );
}
