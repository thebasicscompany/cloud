import type { Metadata } from "next";

import { getConnections } from "@/lib/connections-data";

import { BrowserWorkbench } from "./_components/browser-workbench";

export const metadata: Metadata = {
  title: "Browser | basichome",
  description: "Run browser tasks in the cloud and sign in to sites once so agents can reuse the session.",
};

export const dynamic = "force-dynamic";

export default async function BrowserPage() {
  const { browserSites } = await getConnections();
  return <BrowserWorkbench savedSites={browserSites} />;
}
