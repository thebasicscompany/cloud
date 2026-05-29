import type { Metadata } from "next";

import { getConnections } from "@/lib/connections-data";

import { ConnectionsConsole } from "./_components/connections-console";

export const metadata: Metadata = {
  title: "Connections | basichome",
  description:
    "Connect and reconnect Composio toolkits, model credentials, and saved browser logins for this workspace.",
};

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const { ws } = await searchParams;
  const data = await getConnections(ws);
  return <ConnectionsConsole data={data} />;
}
