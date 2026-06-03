import "server-only";

import { cloudGet } from "@/lib/api/cloud";

/**
 * Read model for the Connections surface, backed by `cloud/api`
 * (`GET /v1/connections`). The request's workspace JWT scopes every read to the
 * caller's own workspace - no service-role admin client and no hardcoded
 * workspace id. Secret material is NEVER returned: the backend excludes
 * `workspace_credentials.ciphertext` (the encrypted secret) and
 * `workspace_browser_sites.storage_state_json` (the saved cookies / storage
 * state) at the query level so they can never reach a client.
 */

/** Primary basichome workspace - used when no workspace id is supplied. */
export const PRIMARY_WORKSPACE_ID = "139e7cdc-7060-49c8-a04f-2afffddbd708";

export interface ConnectionToolkit {
  /** Composio toolkit slug (e.g. "gmail", "googlecalendar"). */
  slug: string;
  schemaVersion: number | null;
  fetchedAt: string | null;
}

export interface ConnectionCredential {
  id: string;
  /** Provider family - e.g. "gmail", "anthropic". */
  kind: string;
  label: string | null;
  /** Where the credential came from - e.g. "basics_managed", "byok". */
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

/**
 * The `workspaceId` arg is accepted for backwards compatibility with existing
 * callers but is now IGNORED: the request's workspace JWT scopes the read on
 * the backend, so the workspace is no longer chosen on the client.
 */
export async function getConnections(_workspaceId?: string): Promise<ConnectionsData> {
  return cloudGet<ConnectionsData>("/v1/connections", emptyData(""));
}
