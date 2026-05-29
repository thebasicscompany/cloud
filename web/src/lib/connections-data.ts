import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Real read model for the Connections surface, backed by the live Basics
 * Supabase project. Read-only via the service-role client. Secret material is
 * NEVER selected: `workspace_credentials.ciphertext` (the encrypted secret) and
 * `workspace_browser_sites.storage_state_json` (the saved cookies / storage
 * state) are excluded at the query level so they can never reach a client.
 */

/** Primary basichome workspace — used when no workspace id is supplied. */
export const PRIMARY_WORKSPACE_ID = "139e7cdc-7060-49c8-a04f-2afffddbd708";

export interface ConnectionToolkit {
  /** Composio toolkit slug (e.g. "gmail", "googlecalendar"). */
  slug: string;
  schemaVersion: number | null;
  fetchedAt: string | null;
}

export interface ConnectionCredential {
  id: string;
  /** Provider family — e.g. "gmail", "anthropic". */
  kind: string;
  label: string | null;
  /** Where the credential came from — e.g. "basics_managed", "byok". */
  provenance: string | null;
  /** e.g. "active", "expired", "not_provisioned", "revoked". */
  status: string | null;
  lastUsedAt: string | null;
  /** Most recent provider-side error message (already redacted upstream). */
  lastProviderError: string | null;
}

export interface ConnectionBrowserSite {
  host: string;
  displayName: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
}

export interface ConnectionsData {
  workspaceId: string;
  toolkits: ConnectionToolkit[];
  credentials: ConnectionCredential[];
  browserSites: ConnectionBrowserSite[];
}

function emptyData(workspaceId: string): ConnectionsData {
  return { workspaceId, toolkits: [], credentials: [], browserSites: [] };
}

export async function getConnections(workspaceId?: string): Promise<ConnectionsData> {
  const ws = workspaceId ?? PRIMARY_WORKSPACE_ID;
  const supabase = getAdminClient();
  if (!supabase) return emptyData(ws);

  const [toolkitsRes, credsRes, sitesRes] = await Promise.all([
    supabase
      .from("composio_tool_cache")
      .select("toolkit_slug,schema_version,fetched_at")
      .eq("workspace_id", ws)
      .order("toolkit_slug", { ascending: true }),
    // NEVER select `ciphertext` (the encrypted secret material).
    supabase
      .from("workspace_credentials")
      .select("id,kind,label,provenance,status,last_used_at,last_provider_error")
      .eq("workspace_id", ws)
      .order("kind", { ascending: true }),
    // NEVER select `storage_state_json` (the saved cookies / storage state).
    supabase
      .from("workspace_browser_sites")
      .select("host,display_name,last_verified_at,expires_at")
      .eq("workspace_id", ws)
      .order("host", { ascending: true }),
  ]);

  const toolkits: ConnectionToolkit[] = (toolkitsRes.data ?? []).map((t) => ({
    slug: t.toolkit_slug as string,
    schemaVersion: (t.schema_version as number) ?? null,
    fetchedAt: (t.fetched_at as string) ?? null,
  }));

  const credentials: ConnectionCredential[] = (credsRes.data ?? []).map((c) => ({
    id: c.id as string,
    kind: (c.kind as string) ?? "unknown",
    label: (c.label as string) ?? null,
    provenance: (c.provenance as string) ?? null,
    status: (c.status as string) ?? null,
    lastUsedAt: (c.last_used_at as string) ?? null,
    lastProviderError: (c.last_provider_error as string) ?? null,
  }));

  const browserSites: ConnectionBrowserSite[] = (sitesRes.data ?? []).map((s) => ({
    host: s.host as string,
    displayName: (s.display_name as string) ?? null,
    lastVerifiedAt: (s.last_verified_at as string) ?? null,
    expiresAt: (s.expires_at as string) ?? null,
  }));

  return { workspaceId: ws, toolkits, credentials, browserSites };
}
