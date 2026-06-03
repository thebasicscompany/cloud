import "server-only";

import { cloudGet } from "@/lib/api/cloud";

/**
 * Apps = agent-built, workspace-private data surfaces. Runs/automations/agents
 * write outputs into them and read off them; the user can also add/edit records
 * directly. Read model backed by the deployed runtime API (`cloud/api`,
 * `/v1/apps`), scoped to the caller's workspace by the workspace JWT - no
 * service-role admin client and no hardcoded workspace id in the renderer.
 */

export type AppKind = "table" | "board" | "list";

export interface AppField {
  key: string;
  label: string;
  type: string; // text | email | number | url | date
}

export interface AppView {
  groupBy?: string;
  titleField?: string;
  bodyField?: string;
  stages?: string[];
  sort?: string;
}

export interface AppRecord {
  id: string;
  data: Record<string, unknown>;
  status: string | null;
  source: { kind: "run" | "automation" | "user"; id: string | null; label: string };
  createdAt: string;
  updatedAt: string;
}

export interface AppSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  kind: AppKind;
  fields: AppField[];
  view: AppView;
  recordCount: number;
  lastActivityAt: string | null;
}

export interface AppDetail extends AppSummary {
  records: AppRecord[];
}

export async function getApps(workspaceId?: string): Promise<AppSummary[]> {
  // workspaceId is scoped server-side by the workspace JWT; ignored here.
  void workspaceId;
  const { apps } = await cloudGet<{ apps: AppSummary[] }>("/v1/apps", { apps: [] });
  return apps;
}

export async function getApp(slug: string, workspaceId?: string): Promise<AppDetail | null> {
  // workspaceId is scoped server-side by the workspace JWT; ignored here.
  void workspaceId;
  const { app } = await cloudGet<{ app: AppDetail | null }>(
    `/v1/apps/${encodeURIComponent(slug)}`,
    { app: null },
  );
  return app;
}
