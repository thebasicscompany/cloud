import "server-only";

import { cloudGet } from "@/lib/api/cloud";

/**
 * Documents = long-form artifacts (reports, plans, drafts) the agent +
 * automations write and the user reviews — distinct from Apps (record
 * collections). Read model now served per-user by cloud/api `/v1/documents`
 * (workspace-scoped by the JWT); no service-role admin client, no hardcoded
 * workspace — safe to run inside the bundled Electron renderer.
 */

export interface DocSource {
  kind: "run" | "automation" | "user";
  id: string | null;
  label: string;
}

export interface DocSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  icon: string | null;
  status: string;
  pinned: boolean;
  source: DocSource;
  updatedAt: string;
}

export interface DocAction {
  label?: string;
  kind?: string;
  status?: string;
  [k: string]: unknown;
}

export interface DocDetail extends DocSummary {
  body: string;
  actions: DocAction[];
}

export async function getDocuments(_workspaceId?: string): Promise<DocSummary[]> {
  const { documents } = await cloudGet<{ documents: DocSummary[] }>("/v1/documents", {
    documents: [],
  });
  return documents;
}

/** Documents a specific run produced (doc_write with source_run_id = runId). */
export async function getRunOutputs(runId: string, _workspaceId?: string): Promise<DocSummary[]> {
  if (!runId) return [];
  const { documents } = await cloudGet<{ documents: DocSummary[] }>(
    `/v1/documents?runId=${encodeURIComponent(runId)}`,
    { documents: [] },
  );
  return documents;
}

export async function getDocument(slug: string, _workspaceId?: string): Promise<DocDetail | null> {
  const { document } = await cloudGet<{ document: DocDetail | null }>(
    `/v1/documents/${encodeURIComponent(slug)}`,
    { document: null },
  );
  return document;
}
