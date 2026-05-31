import type { Metadata } from "next";

import { CloudAutomationsWorkbench } from "./_components/cloud-automations-workbench";

export const metadata: Metadata = {
  title: "Automations | Basics",
  description: "Saved Basics workflows that start local, promote to Basics Cloud, and stay inspectable through logs, replay, schedules, and trust grants.",
};

export default function AutomationsPage() {
  return <CloudAutomationsWorkbench />;
}
