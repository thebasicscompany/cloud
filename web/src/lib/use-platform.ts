"use client";

import { useEffect, useState } from "react";

/**
 * Detect macOS on the client so keyboard-shortcut hints render the right
 * modifier — ⌘ on Mac, Ctrl on Windows/Linux. We ship both desktops, so
 * nothing should hardcode the Mac symbol. SSR-safe: defaults to non-Mac and
 * corrects on mount (the shortcut hint is non-critical chrome).
 */
export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = (nav.userAgentData?.platform || nav.platform || nav.userAgent || "").toLowerCase();
    setIsMac(platform.includes("mac"));
  }, []);
  return isMac;
}

/** Modifier label for shortcut hints: "⌘" on Mac, "Ctrl" elsewhere. */
export function modKeyLabel(isMac: boolean): string {
  return isMac ? "⌘" : "Ctrl";
}
