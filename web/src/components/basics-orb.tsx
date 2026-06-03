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

// Threads three asks: no black, no white wash, AND metallic shimmer. Both
// gradient stops live in the green range so the body of the orb stays
// green; tintColor is saturated green (not near-white) because the final
// `mix(col, 1 - col/tint, length(tint-1)*0.5)` color-burn pass is what
// gives the iridescent chromatic edges - pulling tint to white killed
// the metallic look and made the orb match the iridescent right panel
// (the prior attempt's complaint). Saturated tint + strong chromaticSpread
// + nonzero fresnel = metallic. Bright endpoints = no black/white wash.
const GREEN_LIGHT = "#b3f0c8";
const GREEN_DARK = "#3ab36e";
const GREEN_TINT = "#4ac487";

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
        patternSharpness={1.3}
        noiseScale={0.55}
        speed={pending ? 1.1 : 0.25}
        liquid={pending ? 1.0 : 0.55}
        mouseAnimation={false}
        // brightness = 1 keeps lo = darkColor exactly (the shader does
        // lo = darkColor * (2 - brightness); anything above 1 drags the
        // trough toward black). Chromatic + fresnel + refraction stay
        // turned UP so the metallic shimmer + iridescent rim show through;
        // they're what makes it read as metal instead of a flat green disc.
        brightness={1.0}
        contrast={0.85}
        refraction={0.02}
        blur={0.012}
        chromaticSpread={pending ? 3.8 : 2.8}
        fresnel={0.95}
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
