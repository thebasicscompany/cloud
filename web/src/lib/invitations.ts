import "server-only";

import { cloudGet, cloudGetPublic } from "@/lib/api/cloud";

/**
 * Workspace invitations + membership (multi-seat) — READ model.
 *
 * Every read is served by `cloud/api`, scoped to the caller's workspace by their
 * per-user workspace JWT — no service-role admin client in the renderer.
 *
 *  - `listMembers` / `listInvitations` → `GET /v1/team` (requires workspace JWT;
 *    returns `{ members, invitations }`, we return the matching slice).
 *  - `getInvitationPreview` → `GET /v1/invitations/preview?token=…` (PUBLIC; the
 *    invitee isn't a member yet, so there's no workspace JWT — the opaque invite
 *    token is the credential).
 *
 * The write paths (invite / accept / revoke) now run server-side in `cloud/api`
 * (`POST /v1/team/{invite,accept,revoke}`); the old admin-client mutation
 * helpers that used to live here were removed.
 */

export interface WorkspaceMember {
  accountId: string;
  email: string | null;
  displayName: string | null;
  role: string;
  seatStatus: string | null;
  joinedAt: string | null;
}

export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  token: string;
  status: string;
  createdAt: string | null;
  expiresAt: string | null;
  acceptedAt: string | null;
}

export interface InviteResult {
  ok: boolean;
  invitation?: Invitation;
  acceptUrl?: string;
  emailed?: boolean;
  emailError?: string;
  error?: string;
}

export interface InvitationPreview {
  email: string;
  role: string;
  status: string;
  workspaceName: string;
  expired: boolean;
}

/**
 * PUBLIC preview of an invite by its token — the invitee isn't a member yet, so
 * there's no workspace JWT to present; the opaque token is the credential. Hits
 * the unauthenticated `GET /v1/invitations/preview?token=…`.
 */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  if (!token) return null;
  const preview = await cloudGetPublic<InvitationPreview | null>(
    `/v1/invitations/preview?token=${encodeURIComponent(token)}`,
    null,
  );
  // The endpoint returns the preview object directly (or an `{ error }` body on
  // a miss, which `cloudGet` surfaces as the parsed JSON only on a 2xx). Guard
  // against a non-preview shape so callers always get a clean `null` on a miss.
  if (!preview || typeof preview.email !== "string") return null;
  return preview;
}

export async function listMembers(_workspaceId: string): Promise<WorkspaceMember[]> {
  const { members } = await cloudGet<{ members: WorkspaceMember[]; invitations: Invitation[] }>(
    "/v1/team",
    { members: [], invitations: [] },
  );
  return members;
}

export async function listInvitations(_workspaceId: string): Promise<Invitation[]> {
  const { invitations } = await cloudGet<{
    members: WorkspaceMember[];
    invitations: Invitation[];
  }>("/v1/team", { members: [], invitations: [] });
  return invitations;
}
