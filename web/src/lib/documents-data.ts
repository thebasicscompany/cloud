import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";

/**
 * Documents = long-form artifacts (reports, plans, drafts) that the agent and
 * automations write and the user reviews — distinct from Apps (record
 * collections). Read model via the service-role client, workspace-scoped.
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

async function resolveSources(
  supabase: NonNullable<ReturnType<typeof getAdminClient>>,
  rows: Array<{ source_run_id?: string | null; source_automation_id?: string | null }>,
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(rows.map((r) => r.source_automation_id as string | null).filter(Boolean) as string[]),
  );
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("automations").select("id,name").in("id", ids);
    for (const a of data ?? []) names.set(a.id as string, a.name as string);
  }
  return names;
}

function sourceOf(
  row: { source_run_id?: string | null; source_automation_id?: string | null },
  autoNames: Map<string, string>,
): DocSource {
  const automationId = row.source_automation_id as string | null;
  const runId = row.source_run_id as string | null;
  if (automationId) return { kind: "automation", id: automationId, label: autoNames.get(automationId) ?? "Automation" };
  if (runId) return { kind: "run", id: runId, label: "Agent run" };
  return { kind: "user", id: null, label: "Added by you" };
}

export async function getDocuments(workspaceId?: string): Promise<DocSummary[]> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data: rows } = await supabase
    .from("workspace_documents")
    .select("id,slug,title,summary,icon,status,pinned,source_run_id,source_automation_id,updated_at")
    .eq("workspace_id", ws)
    .neq("status", "archived")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (!rows) return [];
  const autoNames = await resolveSources(supabase, rows);
  return rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    summary: (r.summary as string) ?? "",
    icon: (r.icon as string) ?? null,
    status: (r.status as string) ?? "ready",
    pinned: Boolean(r.pinned),
    source: sourceOf(r, autoNames),
    updatedAt: r.updated_at as string,
  }));
}

/** Documents a specific run produced (doc_write with source_run_id = runId). */
export async function getRunOutputs(runId: string, workspaceId?: string): Promise<DocSummary[]> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase || !runId) return [];
  const { data: rows } = await supabase
    .from("workspace_documents")
    .select("id,slug,title,summary,icon,status,pinned,source_run_id,source_automation_id,updated_at")
    .eq("workspace_id", ws)
    .eq("source_run_id", runId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });
  if (!rows || rows.length === 0) return [];
  const autoNames = await resolveSources(supabase, rows);
  return rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    summary: (r.summary as string) ?? "",
    icon: (r.icon as string) ?? null,
    status: (r.status as string) ?? "ready",
    pinned: Boolean(r.pinned),
    source: sourceOf(r, autoNames),
    updatedAt: r.updated_at as string,
  }));
}

export async function getDocument(slug: string, workspaceId?: string): Promise<DocDetail | null> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data: r } = await supabase
    .from("workspace_documents")
    .select("id,slug,title,summary,icon,status,pinned,body,actions,source_run_id,source_automation_id,updated_at")
    .eq("workspace_id", ws)
    .eq("slug", slug)
    .maybeSingle();
  if (!r) return null;
  const autoNames = await resolveSources(supabase, [r]);
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    summary: (r.summary as string) ?? "",
    icon: (r.icon as string) ?? null,
    status: (r.status as string) ?? "ready",
    pinned: Boolean(r.pinned),
    source: sourceOf(r, autoNames),
    updatedAt: r.updated_at as string,
    body: (r.body as string) ?? "",
    actions: Array.isArray(r.actions) ? (r.actions as DocAction[]) : [],
  };
}
