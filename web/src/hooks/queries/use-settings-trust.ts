"use client";

import { useQuery } from "@tanstack/react-query";

import type { TrustGrant } from "@/types/settings";

/** Real trust grants - backed by /api/settings/trust (workspace_rules). */
export function useSettingsTrustGrants() {
  return useQuery({
    queryKey: ["settings", "trust"],
    queryFn: async (): Promise<TrustGrant[]> => {
      const res = await fetch("/api/settings/trust", { cache: "no-store" });
      if (!res.ok) return [];
      return ((await res.json()).grants ?? []) as TrustGrant[];
    },
  });
}
