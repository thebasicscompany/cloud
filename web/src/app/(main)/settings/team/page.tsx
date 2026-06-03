import type { Metadata } from "next";

import { TeamConsole } from "@/app/(main)/team/_components/team-console";
import { getWorkspaces } from "@/lib/agent-data";
import { listInvitations, listMembers } from "@/lib/invitations";

export const metadata: Metadata = {
  title: "Team | Basics",
  description:
    "Invite teammates to a workspace, manage seats and roles, and let people belong to multiple workspaces.",
};

export const dynamic = "force-dynamic";

export default async function SettingsTeamPage({
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
