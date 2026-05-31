"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { ArrowUpDown, Building2, Check, CircleUser, LogOut, Plus } from "@/icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { MyWorkspace } from "@/lib/workspaces";

/**
 * Sidebar workspace switcher (personal + teams). Switching POSTs the selected
 * workspace to `/api/workspace/switch` (sets the selection cookie) then
 * `router.refresh()` re-renders the whole app under a JWT scoped to it. "Create
 * team" makes a new team workspace and switches into it; "Leave" (teams only)
 * uses a two-click inline confirm — no native dialogs.
 */
export function WorkspaceSwitcher({ workspaces }: { readonly workspaces: readonly MyWorkspace[] }) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const active = workspaces.find((w) => w.current) ?? workspaces[0];
  if (!active) return null;

  async function switchTo(id: string) {
    if (id === active.id || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (active.type === "personal" || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workspace/leave", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) router.refresh();
    } finally {
      setBusy(false);
      setConfirmLeave(false);
    }
  }

  async function createTeam() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/workspace/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setCreateOpen(false);
        setNewName("");
        router.refresh();
      } else {
        setCreateError(data.error ?? "Could not create the workspace.");
      }
    } finally {
      setCreating(false);
    }
  }

  const ActiveIcon = active.type === "personal" ? CircleUser : Building2;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={(open) => !open && setConfirmLeave(false)}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ActiveIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{active.name}</span>
                <span className="truncate text-muted-foreground text-xs capitalize">
                  {active.type === "personal" ? "Personal" : active.role}
                </span>
              </div>
              <ArrowUpDown className="ml-auto size-4 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-60 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">Workspaces</DropdownMenuLabel>
            {workspaces.map((ws) => {
              const Ico = ws.type === "personal" ? CircleUser : Building2;
              return (
                <DropdownMenuItem
                  key={ws.id}
                  className={cn("gap-2", ws.current && "bg-accent/50")}
                  aria-current={ws.current ? "true" : undefined}
                  onClick={() => switchTo(ws.id)}
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <Ico className="size-3.5 shrink-0" />
                  </div>
                  <div className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-sm">{ws.name}</span>
                    <span className="truncate text-muted-foreground text-xs capitalize">
                      {ws.type === "personal" ? "Personal" : ws.role}
                    </span>
                  </div>
                  {ws.current ? <Check className="ml-auto size-4 shrink-0" /> : null}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              onSelect={(e) => {
                e.preventDefault();
                setCreateOpen(true);
              }}
            >
              <div className="flex size-6 items-center justify-center rounded-md border">
                <Plus className="size-3.5 shrink-0" />
              </div>
              Create team
            </DropdownMenuItem>
            {active.type !== "personal" ? (
              <DropdownMenuItem
                className="gap-2 text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  if (!confirmLeave) {
                    setConfirmLeave(true);
                    return;
                  }
                  void leave();
                }}
              >
                <div className="flex size-6 items-center justify-center">
                  <LogOut className="size-4" />
                </div>
                {confirmLeave ? `Click again to leave ${active.name}` : `Leave ${active.name}`}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog
          open={createOpen}
          onOpenChange={(o) => {
            setCreateOpen(o);
            if (!o) setCreateError(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a team workspace</DialogTitle>
              <DialogDescription>
                Teams have shared runs, automations and per-seat billing. You&apos;ll be the owner.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Input
                autoFocus
                placeholder="Acme Inc."
                value={newName}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void createTeam();
                }}
              />
              {createError ? <p className="text-destructive text-sm">{createError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={() => void createTeam()} disabled={creating || !newName.trim()}>
                {creating ? "Creating…" : "Create team"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
