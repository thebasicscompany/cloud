import "server-only";

import { cloudGet } from "@/lib/api/cloud";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

export type MyWorkspace = {
  id: string;
  name: string;
  type: "personal" | "team";
  slug: string;
  role: WorkspaceRole;
  current: boolean;
};

/**
 * Every workspace the signed-in user holds an active seat in (personal + teams),
 * for the sidebar workspace switcher. Backed by cloud/api
 * `GET /v1/team/my-workspaces`, scoped to the caller's account across all their
 * workspaces. `current` marks the workspace embedded in the active JWT (i.e. the
 * one the switcher cookie selected). Returns [] when signed out.
 */
export async function getMyWorkspaces(): Promise<MyWorkspace[]> {
  const data = await cloudGet<{ workspaces: MyWorkspace[] }>("/v1/team/my-workspaces", {
    workspaces: [],
  });
  return Array.isArray(data.workspaces) ? data.workspaces : [];
}
