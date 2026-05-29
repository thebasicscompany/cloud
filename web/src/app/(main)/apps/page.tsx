import type { Metadata } from "next";

import { getApps } from "@/lib/apps-data";

import { AppsOverview } from "./_components/apps-overview";

export const metadata: Metadata = {
  title: "Apps | basichome",
  description: "Workspace apps where your runs and automations drop outputs — and you can add to and read from.",
};

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const apps = await getApps();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Apps</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Typed surfaces your runs and automations write into — a CRM fed by your GTM agent, a digest fed by your
          inbox agent. You can add and edit records too; agents read from these the same way you do.
        </p>
      </header>
      <AppsOverview apps={apps} />
    </div>
  );
}
