import type { ReactNode } from "react";

import Image from "next/image";
import Link from "next/link";

import { Globe } from "@/icons";

import { Separator } from "@/components/ui/separator";
import { APP_CONFIG } from "@/config/app-config";

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main>
      {/* Draggable title-bar strip so the frameless desktop window can be moved
          (the window uses titleBarStyle:hidden + overlay controls). `-webkit-app-region`
          is a no-op in normal browsers, so this is harmless on the web. */}
      <div className="app-drag-region fixed inset-x-0 top-0 z-30 h-9" aria-hidden="true" />

      <div className="grid h-dvh justify-center p-2 lg:grid-cols-2">
        {/* Brand panel - an emerald gradient pulled from the Basics logo color
            (the theme `--primary` is near-black, so we use explicit greens here). */}
        <div className="relative order-2 hidden h-full overflow-hidden rounded-3xl bg-[linear-gradient(140deg,#23ab68_0%,#168350_46%,#093d28_100%)] lg:flex">
          {/* Soft brand-green glows for depth. */}
          <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-[#5ff0a8]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -left-24 size-96 rounded-full bg-[#042c1c]/60 blur-3xl" />
          <div className="pointer-events-none absolute right-1/3 top-1/3 size-64 rounded-full bg-white/[0.06] blur-3xl" />

          <div className="absolute top-12 space-y-3 px-10 text-white">
            <h1 className="text-3xl font-semibold tracking-tight">{APP_CONFIG.name}</h1>
            <p className="max-w-md text-sm text-white/80">
              Run B2B SaaS playbooks in cloud Chrome with live-view, take-over, and an audit log.
            </p>
          </div>

          <div className="absolute bottom-10 flex w-full justify-between px-10">
            <div className="flex-1 space-y-1 text-white">
              <h2 className="font-medium">Demonstrate once.</h2>
              <p className="text-sm text-white/70">
                Record a workflow in your browser. Cloud Chrome replays it on schedule.
              </p>
            </div>
            <Separator orientation="vertical" className="mx-3 h-auto! bg-white/20" />
            <div className="flex-1 space-y-1 text-white">
              <h2 className="font-medium">Stay in control.</h2>
              <p className="text-sm text-white/70">
                Approval gating, take-over, outcome verification - every run audited.
              </p>
            </div>
          </div>
        </div>

        <div className="relative order-1 flex h-full">
          <Link
            href="/"
            prefetch={false}
            className="absolute left-6 top-10 z-40 lg:left-10"
            aria-label={APP_CONFIG.name}
          >
            <Image src="/basics-logo.png" alt="Basics" width={44} height={44} className="rounded-lg" priority />
          </Link>

          {children}

          <div className="absolute bottom-5 flex w-full justify-between px-6 lg:px-10">
            <div className="text-sm">{APP_CONFIG.copyright}</div>
            <div className="flex items-center gap-1 text-sm">
              <Globe className="size-4 text-muted-foreground" />
              ENG
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
