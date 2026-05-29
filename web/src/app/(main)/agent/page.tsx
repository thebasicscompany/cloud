import type { Metadata } from "next";

import { getAgentData, getWorkspaces } from "@/lib/agent-data";

import { AgentConsole } from "./_components/agent-console";

export const metadata: Metadata = {
  title: "Agent | basichome",
  description:
    "Live view of the self-healing cloud agent — learned skills, agent-authored helper modules, managed-browser cookie sessions, and your connections, scoped per workspace.",
};

// Reads live data from the Basics project via the service-role client, so it
// must never be statically prerendered.
export const dynamic = "force-dynamic";

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const { ws } = await searchParams;
  const [workspaces, data] = await Promise.all([getWorkspaces(), getAgentData(ws)]);
  return (
    <AgentConsole data={data} workspaces={workspaces} selectedWorkspaceId={ws ?? null} />
  );
}
