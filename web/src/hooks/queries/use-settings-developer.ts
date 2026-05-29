"use client";

import { useQuery } from "@tanstack/react-query";

import type { ApiToken, WebhookEndpoint } from "@/types/settings";

export type DeveloperSettingsPayload = {
  tokens: ApiToken[];
  webhooks: WebhookEndpoint[];
};

/** Real developer settings — backed by /api/settings/developer (workspace_api_keys). */
export function useSettingsDeveloper() {
  return useQuery({
    queryKey: ["settings", "developer"],
    queryFn: async (): Promise<DeveloperSettingsPayload> => {
      const res = await fetch("/api/settings/developer", { cache: "no-store" });
      if (!res.ok) return { tokens: [], webhooks: [] };
      return (await res.json()) as DeveloperSettingsPayload;
    },
  });
}
