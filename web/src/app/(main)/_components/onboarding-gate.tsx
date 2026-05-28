"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { BASICHOME_ONBOARDING_STORAGE_KEY, isOnboardingComplete } from "@/lib/onboarding";

export function OnboardingGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem(BASICHOME_ONBOARDING_STORAGE_KEY);
    if (!isOnboardingComplete(stored)) {
      const next = encodeURIComponent(pathname || "/");
      router.replace(`/onboarding?next=${next}`);
    }
  }, [pathname, router]);

  return null;
}
