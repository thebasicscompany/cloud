"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Check, Clock, X } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
import type { WorkspaceSummary } from "@/lib/agent-data";
import type { Invitation, WorkspaceMember } from "@/lib/invitations";

interface Props {
  workspaces: WorkspaceSummary[];
  selectedWorkspaceId: string | null;
  members: WorkspaceMember[];
  invitations: Invitation[];
}

export function TeamConsole({ workspaces, selectedWorkspaceId, members, invitations }: Props) {
  const { push, refresh } = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const selected = workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;
  const pending = invitations.filter((i) => i.status === "pending");

  async function sendInvite() {
    if (!selectedWorkspaceId || !email.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          email: email.trim(),
          role,
          workspaceName: selected?.name ?? "your Basics workspace",
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setResult(`Failed: ${data.error ?? "unknown error"}`);
      } else if (data.emailed) {
        setResult(`Invite sent to ${email.trim()}.`);
        setEmail("");
        refresh();
      } else {
        setResult(`Invite created, but email failed: ${data.emailError ?? "unknown"}. Link: ${data.acceptUrl}`);
        setEmail("");
        refresh();
      }
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await fetch("/api/team/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Team</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Invite people to a workspace and manage seats. They get an email with a link to join, and
            once they accept they're added as a member. A person can belong to multiple workspaces.
          </p>
        </div>
        {workspaces.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Workspace</span>
            <Select
              defaultValue={selectedWorkspaceId ?? undefined}
              onValueChange={(v) => push(`/team?ws=${v}`)}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} · {w.slug ?? w.id.slice(0, 8)} · {w.members} members
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite a teammate</CardTitle>
          <CardDescription>They&apos;ll get an email with a link to join this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-72"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="invite-role" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={sendInvite} disabled={busy || !email.trim() || !selectedWorkspaceId}>
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </div>
          {result ? <p className="mt-3 text-sm text-muted-foreground">{result}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members ({members.length})</CardTitle>
          <CardDescription>People with a seat in this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No members.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.accountId}>
                    <TableCell>
                      <div className="font-medium">{m.displayName ?? m.email ?? m.accountId.slice(0, 8)}</div>
                      {m.email ? <div className="text-xs text-muted-foreground">{m.email}</div> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.role === "owner" ? "default" : "secondary"}>{m.role}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.seatStatus ?? "active"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(m.joinedAt ?? undefined)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending invitations ({pending.length})</CardTitle>
          <CardDescription>Invites that haven&apos;t been accepted yet.</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No invitations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.email}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.role}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          i.status === "accepted"
                            ? "secondary"
                            : i.status === "pending"
                              ? "outline"
                              : "destructive"
                        }
                      >
                        {i.status === "accepted" ? (
                          <Check className="size-3" />
                        ) : i.status === "pending" ? (
                          <Clock className="size-3" />
                        ) : (
                          <X className="size-3" />
                        )}
                        {i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(i.expiresAt ?? undefined)}
                    </TableCell>
                    <TableCell className="text-right">
                      {i.status === "pending" ? (
                        <Button variant="ghost" size="sm" onClick={() => revoke(i.id)} disabled={busy}>
                          Revoke
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
