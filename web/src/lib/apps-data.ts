import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";

/**
 * Apps = agent-built, workspace-private data surfaces. Runs/automations/agents
 * write outputs into them and read off them; the user can also add/edit records
 * directly. Read model backed by the live Basics Supabase project via the
 * service-role client, scoped to the workspace at the query level.
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

function parseFields(raw: unknown): AppField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is AppField => Boolean(f) && typeof f === "object")
    .map((f) => ({
      key: String((f as AppField).key ?? ""),
      label: String((f as AppField).label ?? (f as AppField).key ?? ""),
      type: String((f as AppField).type ?? "text"),
    }))
    .filter((f) => f.key);
}

function parseView(raw: unknown): AppView {
  return raw && typeof raw === "object" ? (raw as AppView) : {};
}

export async function getApps(workspaceId?: string): Promise<AppSummary[]> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return [];

  const { data: apps } = await supabase
    .from("workspace_apps")
    .select("id,slug,name,description,icon,kind,fields,view,updated_at")
    .eq("workspace_id", ws)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (!apps || apps.length === 0) return [];

  // Per-app record counts + latest activity (one grouped read).
  const { data: recs } = await supabase
    .from("workspace_app_records")
    .select("app_id,created_at")
    .eq("workspace_id", ws);

  const counts = new Map<string, { count: number; last: string | null }>();
  for (const r of recs ?? []) {
    const appId = r.app_id as string;
    const cur = counts.get(appId) ?? { count: 0, last: null };
    cur.count += 1;
    const ts = r.created_at as string;
    if (!cur.last || ts > cur.last) cur.last = ts;
    counts.set(appId, cur);
  }

  return apps.map((a) => {
    const agg = counts.get(a.id as string) ?? { count: 0, last: null };
    return {
      id: a.id as string,
      slug: a.slug as string,
      name: a.name as string,
      description: (a.description as string) ?? "",
      icon: (a.icon as string) ?? null,
      kind: ((a.kind as string) ?? "table") as AppKind,
      fields: parseFields(a.fields),
      view: parseView(a.view),
      recordCount: agg.count,
      lastActivityAt: agg.last ?? (a.updated_at as string) ?? null,
    };
  });
}

export async function getApp(slug: string, workspaceId?: string): Promise<AppDetail | null> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return null;

  const { data: app } = await supabase
    .from("workspace_apps")
    .select("id,slug,name,description,icon,kind,fields,view,updated_at")
    .eq("workspace_id", ws)
    .eq("slug", slug)
    .maybeSingle();
  if (!app) return null;

  const { data: recs } = await supabase
    .from("workspace_app_records")
    .select("id,data,status,source_run_id,source_automation_id,created_at,updated_at")
    .eq("app_id", app.id as string)
    .order("created_at", { ascending: false })
    .limit(500);

  // Resolve automation provenance to names in one read.
  const automationIds = Array.from(
    new Set((recs ?? []).map((r) => r.source_automation_id as string | null).filter(Boolean) as string[]),
  );
  const autoNames = new Map<string, string>();
  if (automationIds.length > 0) {
    const { data: autos } = await supabase
      .from("automations")
      .select("id,name")
      .in("id", automationIds);
    for (const a of autos ?? []) autoNames.set(a.id as string, a.name as string);
  }

  const records: AppRecord[] = (recs ?? []).map((r) => {
    const automationId = r.source_automation_id as string | null;
    const runId = r.source_run_id as string | null;
    const source: AppRecord["source"] = automationId
      ? { kind: "automation", id: automationId, label: autoNames.get(automationId) ?? "Automation" }
      : runId
        ? { kind: "run", id: runId, label: "Agent run" }
        : { kind: "user", id: null, label: "Added by you" };
    return {
      id: r.id as string,
      data: (r.data as Record<string, unknown>) ?? {},
      status: (r.status as string) ?? null,
      source,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });

  return {
    id: app.id as string,
    slug: app.slug as string,
    name: app.name as string,
    description: (app.description as string) ?? "",
    icon: (app.icon as string) ?? null,
    kind: ((app.kind as string) ?? "table") as AppKind,
    fields: parseFields(app.fields),
    view: parseView(app.view),
    recordCount: records.length,
    lastActivityAt: records[0]?.createdAt ?? (app.updated_at as string) ?? null,
    records,
  };
}
