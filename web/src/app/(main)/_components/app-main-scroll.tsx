"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";

import { Lenis } from "lenis/react";

const LENIS_OPTIONS = {
  autoRaf: true,
  overscroll: true,
} as const;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function AppMainScroll({ children }: { children: ReactNode }) {
  const useLenis = useSyncExternalStore(subscribeToMotionPreference, getMotionPreferenceSnapshot, getMotionPreferenceServerSnapshot);

  const shellClass = "min-h-0 flex-1 overflow-x-hidden overscroll-y-contain";

  if (!useLenis) {
    return (
      <div data-app-scroll="main" className={`${shellClass} overflow-y-auto p-4 pb-28 md:p-6 md:pb-28`}>
        {children}
      </div>
    );
  }

  return (
    <Lenis data-app-scroll="main" className={shellClass} options={LENIS_OPTIONS}>
      <div className="p-4 pb-28 md:p-6 md:pb-28">{children}</div>
    </Lenis>
  );
}

function subscribeToMotionPreference(onStoreChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMotionPreferenceSnapshot() {
  return !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getMotionPreferenceServerSnapshot() {
  return false;
}
