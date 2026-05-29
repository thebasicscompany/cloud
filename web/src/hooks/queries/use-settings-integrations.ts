"use client";

import { useQuery } from "@tanstack/react-query";

import type { Integration } from "@/types/settings";

/** Real integrations — backed by /api/settings/integrations (Composio toolkits + credentials). */
export function useSettingsIntegrations() {
  return useQuery({
    queryKey: ["settings", "integrations"],
    queryFn: async (): Promise<Integration[]> => {
      const res = await fetch("/api/settings/integrations", { cache: "no-store" });
      if (!res.ok) return [];
      return ((await res.json()).integrations ?? []) as Integration[];
    },
  });
}
