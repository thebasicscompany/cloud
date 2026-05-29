"use client";

import { redirect, usePathname } from "next/navigation";

import { BASICHOME_ONBOARDING_STORAGE_KEY, isOnboardingComplete } from "@/lib/onboarding";

export function OnboardingGate() {
  const pathname = usePathname();

  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(BASICHOME_ONBOARDING_STORAGE_KEY);
  if (!isOnboardingComplete(stored)) {
    const next = encodeURIComponent(pathname || "/");
    redirect(`/onboarding?next=${next}`);
  }

  return null;
}
