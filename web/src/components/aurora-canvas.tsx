"use client";

import { cn } from "@/lib/utils";

/**
 * Cloud-like animated aurora — the backdrop for the Create Agent canvas.
 * Layered radial gradients in our brand-green palette, with bright white
 * "light through clouds" highlights against darker teal-green valleys for
 * the same volumetric feel as the reference video (in green, not blue).
 *
 * Strategy: deeper base color so bright blobs pop, several screen-blend
 * highlights for the cloud-lit areas, multiply-blend deeper greens for the
 * shadows, fractalNoise turbulence overlay for vapor-y edges. Pure CSS+SVG,
 * GPU-friendly (transform), no JS animation loop.
 */
export function AuroraCanvas({ className }: { className?: string }) {
  return (
    <div className={cn("relative isolate overflow-hidden bg-[oklch(0.78_0.16_152)]", className)}>
      <div className="aurora-blob aurora-shadow-a" />
      <div className="aurora-blob aurora-shadow-b" />
      <div className="aurora-blob aurora-light-a" />
      <div className="aurora-blob aurora-light-b" />
      <div className="aurora-blob aurora-light-c" />
      <div className="aurora-blob aurora-light-d" />

      {/* Cloud-edge turbulence — gives the gradients a vapor-y texture. */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full opacity-[0.35] mix-blend-overlay">
        <defs>
          <filter id="aurora-turbulence" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="11" />
            <feColorMatrix
              values="0 0 0 0 1
                      0 0 0 0 1
                      0 0 0 0 1
                      0 0 0 1 0"
            />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#aurora-turbulence)" />
      </svg>

      <style jsx>{`
        .aurora-blob {
          position: absolute;
          inset: -30%;
          will-change: transform;
          filter: blur(70px);
        }
        /* Deeper green valleys — multiply for cohesion with base. */
        .aurora-shadow-a {
          background: radial-gradient(50% 55% at 25% 65%, oklch(0.5 0.18 160) 0%, transparent 70%);
          mix-blend-mode: multiply;
          opacity: 0.85;
          animation: drift-1 38s ease-in-out infinite alternate;
        }
        .aurora-shadow-b {
          background: radial-gradient(48% 52% at 80% 80%, oklch(0.45 0.2 165) 0%, transparent 70%);
          mix-blend-mode: multiply;
          opacity: 0.75;
          animation: drift-2 44s ease-in-out infinite alternate;
        }
        /* Bright "light through clouds" highlights — screen-blend to pop. */
        .aurora-light-a {
          background: radial-gradient(45% 50% at 60% 25%, oklch(0.99 0.04 138) 0%, transparent 65%);
          mix-blend-mode: screen;
          animation: drift-3 26s ease-in-out infinite alternate;
        }
        .aurora-light-b {
          background: radial-gradient(38% 42% at 20% 25%, oklch(0.96 0.08 140) 0%, transparent 65%);
          mix-blend-mode: screen;
          animation: drift-4 32s ease-in-out infinite alternate;
        }
        .aurora-light-c {
          background: radial-gradient(40% 45% at 75% 55%, oklch(1 0 0) 0%, transparent 65%);
          mix-blend-mode: screen;
          opacity: 0.65;
          animation: drift-5 22s ease-in-out infinite alternate;
        }
        .aurora-light-d {
          background: radial-gradient(35% 38% at 40% 75%, oklch(0.94 0.09 148) 0%, transparent 65%);
          mix-blend-mode: screen;
          opacity: 0.55;
          animation: drift-6 28s ease-in-out infinite alternate;
        }
        @keyframes drift-1 {
          0% { transform: translate3d(-10%, -5%, 0) scale(1.0) rotate(0deg); }
          100% { transform: translate3d(15%, 10%, 0) scale(1.3) rotate(25deg); }
        }
        @keyframes drift-2 {
          0% { transform: translate3d(10%, 5%, 0) scale(1.2) rotate(0deg); }
          100% { transform: translate3d(-15%, -8%, 0) scale(0.95) rotate(-20deg); }
        }
        @keyframes drift-3 {
          0% { transform: translate3d(-6%, -8%, 0) scale(1.0); }
          100% { transform: translate3d(8%, 12%, 0) scale(1.35); }
        }
        @keyframes drift-4 {
          0% { transform: translate3d(5%, 8%, 0) scale(1.2) rotate(0deg); }
          100% { transform: translate3d(-10%, -5%, 0) scale(1.0) rotate(30deg); }
        }
        @keyframes drift-5 {
          0% { transform: translate3d(-4%, 2%, 0) scale(0.9); }
          100% { transform: translate3d(8%, -6%, 0) scale(1.4); }
        }
        @keyframes drift-6 {
          0% { transform: translate3d(2%, -8%, 0) scale(1.1); }
          100% { transform: translate3d(-12%, 10%, 0) scale(0.85); }
        }
      `}</style>
    </div>
  );
}
