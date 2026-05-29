import type { Metadata } from "next";

import { getWorkspaces } from "@/lib/agent-data";
import { listInvitations, listMembers } from "@/lib/invitations";

import { TeamConsole } from "./_components/team-console";

export const metadata: Metadata = {
  title: "Team | basichome",
  description:
    "Invite teammates to a workspace, manage seats and roles, and let people belong to multiple workspaces.",
};

export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const { ws } = await searchParams;
  const workspaces = await getWorkspaces();
  const selected = ws ?? workspaces[0]?.id ?? null;
  const [members, invitations] = selected
    ? await Promise.all([listMembers(selected), listInvitations(selected)])
    : [[], []];
  return (
    <TeamConsole
      workspaces={workspaces}
      selectedWorkspaceId={selected}
      members={members}
      invitations={invitations}
    />
  );
}
