"use client";

import { cn } from "@/lib/utils";

/**
 * Bold green aurora — the "alive cloud" backdrop for the Create Agent canvas.
 * Four layered conic/radial gradients drifting in opposite directions; no
 * white overlay (we want the green to read clearly). Sized via absolute
 * positioning so the parent can fill the whole right canvas.
 */
export function AuroraCanvas({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-[oklch(0.96_0.04_152)]", className)}>
      <div className="aurora-blob aurora-a" />
      <div className="aurora-blob aurora-b" />
      <div className="aurora-blob aurora-c" />
      <div className="aurora-blob aurora-d" />
      <style jsx>{`
        .aurora-blob {
          position: absolute;
          inset: -10%;
          will-change: transform;
          filter: blur(60px);
        }
        .aurora-a {
          background: radial-gradient(50% 50% at 30% 30%, oklch(0.78 0.18 152) 0%, transparent 70%);
          animation: drift-a 28s ease-in-out infinite alternate;
        }
        .aurora-b {
          background: radial-gradient(45% 55% at 75% 25%, oklch(0.88 0.12 145) 0%, transparent 70%);
          animation: drift-b 34s ease-in-out infinite alternate;
        }
        .aurora-c {
          background: radial-gradient(60% 50% at 80% 80%, oklch(0.72 0.2 158) 0%, transparent 70%);
          mix-blend-mode: multiply;
          animation: drift-c 40s ease-in-out infinite alternate;
        }
        .aurora-d {
          background: radial-gradient(55% 50% at 20% 80%, oklch(0.92 0.08 138) 0%, transparent 70%);
          animation: drift-d 32s ease-in-out infinite alternate;
        }
        @keyframes drift-a {
          0% { transform: translate3d(-5%, -3%, 0) scale(1.0); }
          100% { transform: translate3d(8%, 6%, 0) scale(1.2); }
        }
        @keyframes drift-b {
          0% { transform: translate3d(6%, 2%, 0) scale(1.1); }
          100% { transform: translate3d(-8%, -5%, 0) scale(1.0); }
        }
        @keyframes drift-c {
          0% { transform: translate3d(0, 0, 0) scale(1.0); }
          100% { transform: translate3d(4%, -6%, 0) scale(1.25); }
        }
        @keyframes drift-d {
          0% { transform: translate3d(2%, 5%, 0) scale(1.15); }
          100% { transform: translate3d(-5%, -2%, 0) scale(1.0); }
        }
      `}</style>
    </div>
  );
}
