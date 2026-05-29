import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Workspace invitations + membership (multi-seat).
 *
 * All operations run server-side through the service-role client. Accepting an
 * invite find-or-creates an account by email and adds a workspace_members row,
 * which is what lets one user belong to multiple workspaces.
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

function mapInvitation(r: Record<string, unknown>): Invitation {
  return {
    id: r.id as string,
    workspaceId: r.workspace_id as string,
    email: r.email as string,
    role: r.role as string,
    token: r.token as string,
    status: r.status as string,
    createdAt: (r.created_at as string) ?? null,
    expiresAt: (r.expires_at as string) ?? null,
    acceptedAt: (r.accepted_at as string) ?? null,
  };
}

export interface InvitationPreview {
  email: string;
  role: string;
  status: string;
  workspaceName: string;
  expired: boolean;
}

export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("workspace_invitations")
    .select("email,role,status,expires_at,workspaces(name)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  const ws = (Array.isArray(data.workspaces) ? data.workspaces[0] : data.workspaces) as
    | { name?: string }
    | null;
  return {
    email: data.email as string,
    role: data.role as string,
    status: data.status as string,
    workspaceName: ws?.name ?? "workspace",
    expired: Boolean(data.expires_at && new Date(data.expires_at as string).getTime() < Date.now()),
  };
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("workspace_members")
    .select("account_id,role,seat_status,joined_at,accounts(email,display_name)")
    .eq("workspace_id", workspaceId)
    .order("joined_at", { ascending: true });
  return (data ?? []).map((r) => {
    const acct = (Array.isArray(r.accounts) ? r.accounts[0] : r.accounts) as
      | { email?: string; display_name?: string }
      | null;
    return {
      accountId: r.account_id as string,
      email: acct?.email ?? null,
      displayName: acct?.display_name ?? null,
      role: r.role as string,
      seatStatus: (r.seat_status as string) ?? null,
      joinedAt: (r.joined_at as string) ?? null,
    };
  });
}

export async function listInvitations(workspaceId: string): Promise<Invitation[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("workspace_invitations")
    .select("id,workspace_id,email,role,token,status,created_at,expires_at,accepted_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map(mapInvitation);
}

export async function createInvitation(input: {
  workspaceId: string;
  email: string;
  role?: string;
}): Promise<{ ok: boolean; invitation?: Invitation; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Backend not connected." };

  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email." };

  // Reuse an existing pending invite for the same (workspace, email).
  const existing = await supabase
    .from("workspace_invitations")
    .select("id,workspace_id,email,role,token,status,created_at,expires_at,accepted_at")
    .eq("workspace_id", input.workspaceId)
    .eq("email", email)
    .eq("status", "pending")
    .maybeSingle();
  if (existing.data) return { ok: true, invitation: mapInvitation(existing.data) };

  const { data, error } = await supabase
    .from("workspace_invitations")
    .insert({ workspace_id: input.workspaceId, email, role: input.role ?? "member" })
    .select("id,workspace_id,email,role,token,status,created_at,expires_at,accepted_at")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not create invitation." };
  return { ok: true, invitation: mapInvitation(data) };
}

export async function revokeInvitation(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Backend not connected." };
  const { error } = await supabase
    .from("workspace_invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "pending");
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function acceptInvitation(
  token: string,
): Promise<{ ok: boolean; workspaceId?: string; workspaceName?: string; error?: string }> {
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Backend not connected." };

  const inv = await supabase
    .from("workspace_invitations")
    .select("id,workspace_id,email,role,status,expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!inv.data) return { ok: false, error: "Invitation not found." };
  if (inv.data.status === "accepted") {
    return { ok: true, workspaceId: inv.data.workspace_id as string };
  }
  if (inv.data.status !== "pending") return { ok: false, error: `Invitation is ${inv.data.status}.` };
  if (inv.data.expires_at && new Date(inv.data.expires_at as string).getTime() < Date.now()) {
    await supabase.from("workspace_invitations").update({ status: "expired" }).eq("id", inv.data.id);
    return { ok: false, error: "Invitation has expired." };
  }

  const email = (inv.data.email as string).toLowerCase();

  // Find-or-create the account for this email (accounts is a standalone table).
  const acct = await supabase.from("accounts").select("id").eq("email", email).maybeSingle();
  let accountId = acct.data?.id as string | undefined;
  if (!accountId) {
    const created = await supabase
      .from("accounts")
      .insert({ email, display_name: email.split("@")[0] })
      .select("id")
      .single();
    if (created.error || !created.data) {
      return { ok: false, error: created.error?.message ?? "Could not create account." };
    }
    accountId = created.data.id as string;
  }

  // Add the member if not already on the workspace (idempotent → multi-seat).
  const member = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", inv.data.workspace_id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (!member.data) {
    const added = await supabase.from("workspace_members").insert({
      workspace_id: inv.data.workspace_id,
      account_id: accountId,
      role: inv.data.role,
      seat_status: "active",
    });
    if (added.error) return { ok: false, error: added.error.message };
  }

  await supabase
    .from("workspace_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), accepted_by: accountId })
    .eq("id", inv.data.id);

  const ws = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", inv.data.workspace_id)
    .maybeSingle();

  return {
    ok: true,
    workspaceId: inv.data.workspace_id as string,
    workspaceName: (ws.data?.name as string) ?? "workspace",
  };
}
