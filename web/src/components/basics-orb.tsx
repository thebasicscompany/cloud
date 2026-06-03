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

// Palette has to thread two opposite asks: "no black" AND "too much white".
// So both gradient stops sit in the *mid* green range - the highlights are
// pastel green (not near-white), the troughs are saturated mid green (not
// near-black). The shader's hi/lo bands stay clearly green at every pixel.
// `tintColor` close to white keeps the final color-burn pass weak so the
// burn doesn't yank the result back toward darker hues.
const GREEN_LIGHT = "#c9f5d8";
const GREEN_DARK = "#5fc88a";
const GREEN_TINT = "#dcf2e1";

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
        // brightness = 1 keeps the trough = darkColor exactly (the shader
        // computes lo = darkColor * (2 - brightness); anything > 1 drives lo
        // toward black). Lower fresnel + chromaticSpread tame the bright rim
        // that otherwise reads as a white halo and washes the orb out.
        brightness={1.0}
        contrast={0.55}
        refraction={0.012}
        blur={0.014}
        chromaticSpread={pending ? 2.4 : 1.4}
        fresnel={0.65}
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
