"use client";

import { useEffect, useState } from "react";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/**
 * The "Record routine" trigger (desktop only). Recording itself happens in the
 * FLOATING Record/Teach HUD — a frameless, always-on-top window over the user's
 * other apps (see desktop/main.js openPill + app/pill) — so they can demonstrate
 * a workflow elsewhere and talk it through while Lens captures it. This sidebar
 * entry (and the global Ctrl/⌘+Shift+Space chord) just opens that HUD. Renders
 * only in the desktop app on a platform Lens supports; otherwise nothing.
 *
 * Lives in the sidebar footer (above the profile) so it never overlaps content.
 */
interface PillBridge {
  isDesktop?: boolean;
  openPill?: () => void;
  lensStatus?: () => Promise<{ supported?: boolean }>;
}
function bridge(): PillBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { basichome?: PillBridge }).basichome;
}

export function RecordRoutine() {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const bh = bridge();
    if (!bh?.isDesktop || !bh.openPill || !bh.lensStatus) return;
    void bh
      .lensStatus()
      .then((s) => setSupported(Boolean(s?.supported)))
      .catch(() => setSupported(false));
  }, []);

  if (!supported) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => bridge()?.openPill?.()}
          tooltip="Record & teach a routine (Ctrl/⌘+Shift+Space)"
        >
          <span className="flex size-4 shrink-0 items-center justify-center">
            <span className="size-2.5 rounded-full bg-red-500" />
          </span>
          <span>Record routine</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
