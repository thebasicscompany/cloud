import type { Metadata } from "next";

import { getAgentData } from "@/lib/agent-data";

import { MemoryView } from "./_components/memory-view";

export const metadata: Metadata = {
  title: "Memory | Basics",
  description: "What your agents have learned — saved skills and shortcuts.",
};

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const data = await getAgentData();
  return <MemoryView skills={data.skills} helpers={data.helpers} />;
}
