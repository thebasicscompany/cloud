import type { Metadata } from "next";

import { LogsConsole } from "../logs/_components/logs-console";

export const metadata: Metadata = {
  title: "Audit | Basics",
  description: "Workspace audit log for Basics runs, approvals, app updates, and context exports.",
};

export default function Page() {
  return <LogsConsole />;
}
