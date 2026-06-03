import { redirect } from "next/navigation";

// Agents is the new front door. The old HomeDashboard (recent runs, approvals,
// suggestions, etc.) is intentionally retired in favor of a single clear
// starting point: pick an agent (or create one).
export default function Page() {
  redirect("/agents");
}
