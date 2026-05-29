import type { Metadata } from "next";

import { getApps } from "@/lib/apps-data";

import { AppsOverview } from "./_components/apps-overview";

export const metadata: Metadata = {
  title: "Apps | basichome",
  description: "Simple databases your runs and automations fill in, that you can add to and read from too.",
};

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const apps = await getApps();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Apps</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Simple databases your runs and automations fill in, like a CRM your sales agent keeps up to
          date or a daily digest from your inbox agent. You can add and edit records yourself, and your
          agents read them the same way you do.
        </p>
      </header>
      <AppsOverview apps={apps} />
    </div>
  );
}
