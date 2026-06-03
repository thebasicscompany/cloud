import { RunsTable } from "./_components/runs-table";

export default function RunsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="font-semibold text-2xl">Activity</h1>
      </header>
      <RunsTable />
    </div>
  );
}
