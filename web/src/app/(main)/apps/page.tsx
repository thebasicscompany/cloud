import { AppsOverview } from "./_components/apps-overview";

export default function AppsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Apps</h1>
        <p className="text-muted-foreground text-sm">
          Private workspace apps installed through basichome. Review health, rollout state, permissions, and deployment targets.
        </p>
      </header>
      <AppsOverview />
    </div>
  );
}
