import "server-only";

import { getConnections, PRIMARY_WORKSPACE_ID } from "@/lib/connections-data";
import { getAdminClient } from "@/lib/supabase/admin";
import type {
  ApiToken,
  Integration,
  IntegrationStatus,
  TrustGrant,
  WebhookEndpoint,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "@/types/settings";

/**
 * Real settings read model — backed by the live `workspaces`, `workspace_members`,
 * and `accounts` tables. There is no billing system, so billing fields carry
 * honest placeholders (the view hides the billing card). Workspace-scoped.
 */

export type WorkspaceSettingsPayload = {
  workspace: WorkspaceSummary;
  members: WorkspaceMember[];
};

function mapRole(role: string | null): WorkspaceRole {
  return role === "owner" || role === "admin" || role === "member" ? role : "member";
}

export async function getWorkspaceSettings(workspaceId?: string): Promise<WorkspaceSettingsPayload | null> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return null;

  const { data: wsRow } = await supabase
    .from("workspaces")
    .select("id,name,slug,type,created_at")
    .eq("id", ws)
    .maybeSingle();
  if (!wsRow) return null;

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("id,role,seat_status,joined_at,account_id,accounts(email,display_name)")
    .eq("workspace_id", ws)
    .order("joined_at", { ascending: true });

  const members: WorkspaceMember[] = (memberRows ?? []).map((m) => {
    const acct = (m as { accounts?: { email?: string; display_name?: string } }).accounts ?? {};
    return {
      id: m.id as string,
      displayName: acct.display_name || acct.email || "Member",
      email: acct.email || "—",
      role: mapRole(m.role as string),
      joinedAt: (m.joined_at as string) ?? (wsRow.created_at as string),
    };
  });

  const workspace: WorkspaceSummary = {
    id: wsRow.id as string,
    name: (wsRow.name as string) ?? "Workspace",
    slug: (wsRow.slug as string) ?? "",
    billing: {
      // No billing system — honest placeholders; the view hides this card.
      planName: ((wsRow.type as string) ?? "self_hosted").replaceAll("_", " "),
      seatsIncluded: members.length,
      seatsUsed: members.length,
      renewsAt: "",
      paymentMethodSummary: "Not billed",
    },
  };

  return { workspace, members };
}

function prettyToolkit(slug: string): string {
  const map: Record<string, string> = {
    gmail: "Gmail",
    googlesheets: "Google Sheets",
    googlecalendar: "Google Calendar",
    googledrive: "Google Drive",
    hubspot: "HubSpot",
    slack: "Slack",
    linkedin: "LinkedIn",
  };
  return map[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

function credentialStatus(s: string | null): IntegrationStatus {
  switch ((s ?? "").toLowerCase()) {
    case "active":
      return "connected";
    case "expired":
      return "expiring_soon";
    case "revoked":
    case "error":
      return "error";
    default:
      return "disconnected";
  }
}

/** Real integrations — the workspace's connected Composio toolkits + provider credentials. */
export async function getIntegrationsSettings(workspaceId?: string): Promise<Integration[]> {
  const conn = await getConnections(workspaceId);
  const seen = new Set<string>();
  const out: Integration[] = [];

  for (const t of conn.toolkits) {
    const key = t.slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `toolkit:${t.slug}`,
      name: prettyToolkit(t.slug),
      description: "Composio toolkit — tools the agent can call.",
      status: "connected",
      detail: t.fetchedAt ? `Synced ${new Date(t.fetchedAt).toLocaleDateString()}` : undefined,
    });
  }
  for (const c of conn.credentials) {
    const rawName = (c.label ?? c.kind ?? "").trim();
    if (!rawName) continue; // skip credentials with no provider/label — not a real integration row
    const key = rawName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `cred:${c.id}`,
      name: c.label ?? prettyToolkit(c.kind),
      description: c.provenance ? `${c.kind} · ${c.provenance}` : c.kind,
      status: credentialStatus(c.status),
      detail: c.lastProviderError ?? (c.lastUsedAt ? `Used ${new Date(c.lastUsedAt).toLocaleDateString()}` : undefined),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type DeveloperSettingsPayload = { tokens: ApiToken[]; webhooks: WebhookEndpoint[] };

/** Real developer settings — workspace API keys (webhooks not yet a real surface → empty). */
export async function getDeveloperSettings(workspaceId?: string): Promise<DeveloperSettingsPayload> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return { tokens: [], webhooks: [] };
  const { data } = await supabase
    .from("workspace_api_keys")
    .select("id,name,prefix,created_at,last_used_at,status,revoked_at")
    .eq("workspace_id", ws)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const tokens: ApiToken[] = (data ?? []).map((k) => ({
    id: k.id as string,
    label: (k.name as string) ?? "API key",
    prefix: (k.prefix as string) ?? "bk_",
    createdAt: (k.created_at as string) ?? "",
    lastUsedAt: (k.last_used_at as string) ?? undefined,
  }));
  return { tokens, webhooks: [] };
}

/** Real trust grants — scoped autonomy rules from workspace_rules (empty until any are granted). */
export async function getTrustSettings(workspaceId?: string): Promise<TrustGrant[]> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data } = await supabase.from("workspace_rules").select("*").eq("workspace_id", ws);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      actionPattern: String(row.action_pattern ?? row.pattern ?? row.name ?? "—"),
      paramsConstraint: String(row.params_constraint ?? row.constraint ?? ""),
      scope: "workspace" as const,
      grantedByName: "—",
      grantedAt: String(row.created_at ?? ""),
    } satisfies TrustGrant;
  });
}
