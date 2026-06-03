"use client";

import { useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import type { MyWorkspace } from "@/lib/workspaces";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { WorkspaceSwitcher } from "./workspace-switcher";

type AppSidebarProps = {
  user: { name: string; email: string; avatar: string };
  workspaces: MyWorkspace[];
};

export function AppSidebar({ user, workspaces }: AppSidebarProps) {
  // On macOS Electron the window uses `titleBarStyle: hidden` and the traffic
  // lights sit at x:14, y:14 - they overlap the sidebar's top edge. Pad the
  // header down past them. Client-only check (avoids SSR hydration mismatch).
  const [isMacElectron, setIsMacElectron] = useState(false);
  useEffect(() => {
    const bh = (window as unknown as { basichome?: { platform?: string } }).basichome;
    setIsMacElectron(bh?.platform === "darwin");
  }, []);

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader
        className={isMacElectron ? "pt-11" : undefined}
        style={isMacElectron ? { WebkitAppRegion: "drag" } as React.CSSProperties : undefined}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              className="hover:bg-transparent active:bg-transparent"
            >
              <Link prefetch={false} href="/" aria-label="Basics" className="flex items-center justify-start">
                <Image
                  src="/basics-logo.png"
                  alt="Basics"
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-md"
                  priority
                />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {workspaces.length > 0 ? <WorkspaceSwitcher workspaces={workspaces} /> : null}
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
