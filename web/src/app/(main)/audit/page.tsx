import type { Metadata } from "next";

import { LogsConsole } from "../logs/_components/logs-console";

export const metadata: Metadata = {
  title: "Audit | basichome",
  description: "Workspace audit log for basichome runs, approvals, app updates, and context exports.",
};

export default function Page() {
  return <LogsConsole />;
}
