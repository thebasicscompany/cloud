import "server-only";

import { cloudGet } from "@/lib/api/cloud";
import { getConnections } from "@/lib/connections-data";
import type {
  ApiToken,
  Integration,
  IntegrationStatus,
  TrustGrant,
  WebhookEndpoint,
  WorkspaceMember,
  WorkspaceSummary,
} from "@/types/settings";

/**
 * Real settings read model - backed by cloud/api (`/v1/settings/*`), which
 * derives a per-user workspace JWT from the session and scopes every read to
 * the caller's own workspace (no service-role admin key, no hardcoded
 * PRIMARY_WORKSPACE_ID in the renderer). There is no billing system, so billing
 * fields carry honest placeholders (the view hides the billing card).
 *
 * `getIntegrationsSettings` stays on the connections data lib - it is derived
 * from connections, not a settings table.
 */

export type WorkspaceSettingsPayload = {
  workspace: WorkspaceSummary;
  members: WorkspaceMember[];
};

export async function getWorkspaceSettings(): Promise<WorkspaceSettingsPayload | null> {
  const { workspace, members } = await cloudGet<{
    workspace: WorkspaceSummary | null;
    members: WorkspaceMember[];
  }>("/v1/settings/workspace", { workspace: null, members: [] });
  if (!workspace) return null;
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

/** Real integrations - the workspace's connected Composio toolkits + provider credentials. */
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
      description: "Composio toolkit - tools the agent can call.",
      status: "connected",
      detail: t.fetchedAt ? `Synced ${new Date(t.fetchedAt).toLocaleDateString()}` : undefined,
    });
  }
  for (const c of conn.credentials) {
    const rawName = (c.label ?? c.kind ?? "").trim();
    if (!rawName) continue; // skip credentials with no provider/label - not a real integration row
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

/** Real developer settings - workspace API keys (webhooks not yet a real surface → empty). */
export async function getDeveloperSettings(): Promise<DeveloperSettingsPayload> {
  return cloudGet<DeveloperSettingsPayload>("/v1/settings/developer", {
    tokens: [],
    webhooks: [],
  });
}

/** Real trust grants - scoped autonomy rules from workspace_rules (empty until any are granted). */
export async function getTrustSettings(): Promise<TrustGrant[]> {
  const { grants } = await cloudGet<{ grants: TrustGrant[] }>("/v1/settings/trust", {
    grants: [],
  });
  return grants;
}
