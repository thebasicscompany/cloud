import { ApprovalsView } from "./_components/approvals-view";

export const metadata = {
  title: "Approvals | basichome",
  description: "Workspace approval queue for app releases, trust grants, credentials, policies, and autonomous actions.",
};

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground text-sm">
          Things waiting for your sign-off before your agent acts. You approve or decline, and
          basichome carries it out and can undo it if needed.
        </p>
      </header>
      <ApprovalsView />
    </div>
  );
}
