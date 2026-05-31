"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Building2, Check } from "@/icons";

import { Button } from "@/components/ui/button";

type Invite = { id: string; token: string; role: string; workspaceId: string; workspaceName: string };

/**
 * Home "you've been invited" banner — surfaces pending workspace invitations
 * addressed to the signed-in user's email so they accept in-app instead of
 * hunting for the email link. Accepting adds the membership; `router.refresh()`
 * then re-renders the sidebar switcher with the new workspace. Renders nothing
 * when there are no pending invites.
 */
export function PendingInvitesBanner() {
  const router = useRouter();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetch("/api/team/invites-for-me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { invites?: Invite[] } | null) => {
        if (on && Array.isArray(d?.invites)) setInvites(d.invites);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  if (invites.length === 0) return null;

  async function accept(invite: Invite) {
    setBusyToken(invite.token);
    setError(null);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: invite.token }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setInvites((prev) => prev.filter((i) => i.token !== invite.token));
        router.refresh();
      } else {
        setError(data.error ?? "Could not accept the invitation.");
      }
    } finally {
      setBusyToken(null);
    }
  }

  return (
    <div className="flex items-start gap-3.5 rounded-xl border bg-card p-4 shadow-sm">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Building2 className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="space-y-1">
          <p className="font-semibold text-foreground text-sm">
            {invites.length === 1 ? "You have a workspace invitation" : `You have ${invites.length} workspace invitations`}
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Accept to join, then switch into it from the workspace menu in the sidebar.
          </p>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <div className="flex flex-col gap-2">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium text-foreground">{inv.workspaceName}</span>
                <span className="text-muted-foreground"> · as {inv.role}</span>
              </div>
              <Button size="sm" className="h-8 gap-1.5" disabled={busyToken === inv.token} onClick={() => accept(inv)}>
                <Check className="size-3.5" />
                {busyToken === inv.token ? "Joining…" : "Accept"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
