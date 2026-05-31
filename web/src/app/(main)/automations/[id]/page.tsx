import type { Metadata } from "next";

import { CloudAutomationDetail } from "../_components/cloud-automations-workbench";

export const metadata: Metadata = {
  title: "Automation | Basics",
  description: "Cloud automation detail with runs, replay, schedule, triggers, credentials, and trust grants.",
};

type Params = { id: string };

export default async function AutomationPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return <CloudAutomationDetail id={id} />;
}
