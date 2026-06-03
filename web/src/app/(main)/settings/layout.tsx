import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";

import { SettingsNav } from "./_components/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
        <p className="mt-1 text-foreground/60 text-sm">Manage your account, workspace, integrations, and more.</p>
      </div>
      <Separator />
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <aside>
          <SettingsNav />
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
