"use client";

import { useQuery } from "@tanstack/react-query";

import type { WorkspaceMember, WorkspaceSummary } from "@/types/settings";

export type WorkspaceSettingsPayload = {
  workspace: WorkspaceSummary;
  members: WorkspaceMember[];
};

/** Real workspace settings — backed by /api/settings/workspace (workspaces + members). */
export function useSettingsWorkspace() {
  return useQuery({
    queryKey: ["settings", "workspace"],
    queryFn: async (): Promise<WorkspaceSettingsPayload | null> => {
      const res = await fetch("/api/settings/workspace", { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json()) as WorkspaceSettingsPayload;
    },
  });
}
