import type { Metadata } from "next";

import { cloudGet } from "@/lib/api/cloud";

import { ResourcesView, type Resource } from "../_components/resources-view";

export const metadata: Metadata = {
  title: "Resources | Basics",
  description:
    "Long-lived apps and docs your agents know about - add ones you've already made, change what agents can edit, or revoke access.",
};

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const data = await cloudGet<{ resources: Resource[] }>("/v1/resources", { resources: [] });
  return <ResourcesView initialResources={data.resources} />;
}
