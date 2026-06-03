"use client";

import dynamic from "next/dynamic";

import { cn } from "@/lib/utils";

/**
 * The Basics chat avatar - a green metallic orb. When `pending` is true the
 * liquid / wave / distortion knobs are cranked so it reads as ferrofluid with
 * spikes (the "Basics is thinking" tell). When idle it's a calm metallic
 * green circle, no glow, no pulse - per explicit user direction.
 *
 * Backed by the React-Bits MetallicPaint shader. Heavy enough that we lazy-
 * load it on the client and ssr:false to keep the initial bundle skinny and
 * avoid SSR'ing a WebGL canvas.
 */
const MetallicPaint = dynamic(() => import("./metallic-paint"), {
  ssr: false,
  loading: () => null,
});

const GREEN_LIGHT = "#bff5d4";
const GREEN_DARK = "#0e3d1f";
const GREEN_TINT = "#3fa56b";

export function BasicsOrb({ pending = false, size = 24, className }: { pending?: boolean; size?: number; className?: string }) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <MetallicPaint
        imageSrc="/basics-orb.svg"
        seed={42}
        scale={3.2}
        patternSharpness={1.1}
        noiseScale={0.55}
        speed={pending ? 1.1 : 0.25}
        liquid={pending ? 1.0 : 0.55}
        mouseAnimation={false}
        brightness={2.0}
        contrast={0.55}
        refraction={0.012}
        blur={0.014}
        chromaticSpread={pending ? 3.2 : 2.0}
        fresnel={1.1}
        angle={0}
        waveAmplitude={pending ? 2.6 : 0.9}
        distortion={pending ? 1.0 : 0.4}
        contour={pending ? 0.55 : 0.18}
        lightColor={GREEN_LIGHT}
        darkColor={GREEN_DARK}
        tintColor={GREEN_TINT}
        className="block h-full w-full"
      />
    </span>
  );
}
