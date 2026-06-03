"use client";

import { cn } from "@/lib/utils";

/**
 * Vibrant green aurora with pure-white cloud streaks — modeled on the
 * reference video's blue/white cloud sky, just in our brand green. White
 * blobs are opacity 1.0 with screen blend so the highlights actually read
 * as bright white, not washed-out grey. Slow wave-like motion (50-80s) so
 * it feels alive but never busy.
 *
 * Pure CSS+SVG, GPU only (transform).
 */
export function AuroraCanvas({ className }: { className?: string }) {
  return (
    <div className={cn("relative isolate overflow-hidden bg-[oklch(0.68_0.27_152)]", className)}>
      <div className="aurora-cloud a" />
      <div className="aurora-cloud b" />
      <div className="aurora-cloud c" />
      <div className="aurora-cloud d" />
      <div className="aurora-cloud e" />
      <div className="aurora-cloud f" />
      <div className="aurora-cloud g" />

      {/* White vapor texture — gives the cloud edges that wispy, organic feel. */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full opacity-[0.5] mix-blend-screen">
        <defs>
          <filter id="aurora-vapor" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="11" />
            <feColorMatrix
              values="0 0 0 0 1
                      0 0 0 0 1
                      0 0 0 0 1
                      0 0 0 1.5 -0.2" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="3" intercept="-0.8" />
            </feComponentTransfer>
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#aurora-vapor)" />
      </svg>

      <style jsx>{`
        .aurora-cloud {
          position: absolute;
          inset: -25%;
          will-change: transform;
          background: radial-gradient(50% 50% at 50% 50%, oklch(1 0 0) 0%, oklch(1 0 0 / 0.4) 30%, transparent 60%);
          filter: blur(50px);
          mix-blend-mode: screen;
          opacity: 1;
        }
        /* Slow wave motion — each cloud drifts at its own speed so the surface
         * has continuous, never-repeating-looking movement. */
        .a { animation: wave-a 56s ease-in-out infinite alternate; }
        .b { animation: wave-b 64s ease-in-out infinite alternate; }
        .c { animation: wave-c 72s ease-in-out infinite alternate; }
        .d { animation: wave-d 58s ease-in-out infinite alternate; }
        .e { animation: wave-e 80s ease-in-out infinite alternate; }
        .f { animation: wave-f 68s ease-in-out infinite alternate; }
        .g { animation: wave-g 76s ease-in-out infinite alternate; }
        @keyframes wave-a {
          0%   { transform: translate3d(-12%, -8%, 0) scale(0.7); }
          50%  { transform: translate3d(4%, 2%, 0)   scale(1.2); }
          100% { transform: translate3d(14%, 10%, 0) scale(0.9); }
        }
        @keyframes wave-b {
          0%   { transform: translate3d(12%, -4%, 0) scale(1.0); }
          50%  { transform: translate3d(-2%, 6%, 0)  scale(1.4); }
          100% { transform: translate3d(-14%, 0, 0)  scale(0.75); }
        }
        @keyframes wave-c {
          0%   { transform: translate3d(4%, 12%, 0)  scale(0.85); }
          50%  { transform: translate3d(-8%, -2%, 0) scale(1.5); }
          100% { transform: translate3d(2%, -12%, 0) scale(0.7); }
        }
        @keyframes wave-d {
          0%   { transform: translate3d(-6%, 6%, 0)  scale(1.1); }
          50%  { transform: translate3d(10%, -8%, 0) scale(0.8); }
          100% { transform: translate3d(-4%, 12%, 0) scale(1.3); }
        }
        @keyframes wave-e {
          0%   { transform: translate3d(6%, -10%, 0) scale(0.75); }
          50%  { transform: translate3d(-10%, 2%, 0) scale(1.3); }
          100% { transform: translate3d(8%, 10%, 0)  scale(0.9); }
        }
        @keyframes wave-f {
          0%   { transform: translate3d(0, 0, 0)     scale(1.0); }
          50%  { transform: translate3d(8%, -6%, 0)  scale(1.4); }
          100% { transform: translate3d(-10%, 8%, 0) scale(0.7); }
        }
        @keyframes wave-g {
          0%   { transform: translate3d(-8%, 4%, 0)  scale(0.95); }
          50%  { transform: translate3d(6%, -10%, 0) scale(1.25); }
          100% { transform: translate3d(-2%, 12%, 0) scale(0.8); }
        }
      `}</style>
    </div>
  );
}
