import type { Metadata } from "next";

import { CloudAutomationsWorkbench } from "./_components/cloud-automations-workbench";

export const metadata: Metadata = {
  title: "Automations | basichome",
  description: "Saved basichome workflows that start local, promote to Basics Cloud, and stay inspectable through logs, replay, schedules, and trust grants.",
};

export default function AutomationsPage() {
  return <CloudAutomationsWorkbench />;
}
