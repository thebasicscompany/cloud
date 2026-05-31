import type { Metadata } from "next";

import { LogsConsole } from "./_components/logs-console";

export const metadata: Metadata = {
  title: "Logs/Audit | Basics",
  description: "Local agent action logs, run events, and replay-ready audit fields.",
};

export default function LogsPage() {
  return <LogsConsole />;
}
