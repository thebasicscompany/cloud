"use client";

import { useState } from "react";

import Link from "next/link";
import { toast } from "sonner";

import { Folder, Trash2 } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/**
 * Workspace resources — the audit + access-control surface for things your
 * AGENTS created on previous runs (Notion pages, Sheets, Airtable bases,
 * Slack channels, ...). NOT a "paste any URL" bookmark folder: the user
 * can't manually add external resources here because we can't guarantee an
 * agent can edit a URL it didn't create + the Composio connection for. To
 * create a NEW thing the agent should fill/maintain, the user makes an App
 * over on /apps — that's where the dataset surface lives.
 *
 * Per-row controls:
 *   - Rename / edit URL + notes (in case the agent named it badly)
 *   - Change agent_access (read_write | read | none)
 *   - Delete (drops the registry row; doesn't touch the underlying artifact)
 */

export type AgentAccess = "none" | "read" | "read_write";
export type ResourceSource = "agent_created" | "user_added";

export interface Resource {
  id: string;
  kind: string;
  name: string;
  url: string | null;
  externalId: string | null;
  description: string | null;
  source: ResourceSource;
  agentAccess: AgentAccess;
  toolkitSlug: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const ACCESS_LABEL: Record<AgentAccess, string> = {
  read_write: "Read + write",
  read: "Read-only",
  none: "Off-limits",
};

const ACCESS_VARIANT: Record<AgentAccess, "default" | "secondary" | "outline"> = {
  read_write: "default",
  read: "secondary",
  none: "outline",
};

export function ResourcesView({ initialResources }: { initialResources: Resource[] }) {
  const [resources, setResources] = useState<Resource[]>(initialResources);

  async function patchResource(id: string, body: Partial<Pick<Resource, "name" | "url" | "externalId" | "description" | "agentAccess" | "toolkitSlug">>) {
    const optimistic = resources.map((r) => (r.id === id ? { ...r, ...body } : r));
    setResources(optimistic);
    try {
      const res = await fetch(`/api/resources/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { resource?: Resource; error?: string };
      if (!res.ok || !json.resource) throw new Error(json.error ?? "patch failed");
      setResources((prev) => prev.map((r) => (r.id === id ? json.resource! : r)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save change");
      setResources(initialResources);
    }
  }

  async function deleteResource(id: string) {
    if (!confirm("Remove this resource? Your agents will no longer see it.")) return;
    const prev = resources;
    setResources(resources.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/resources/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't delete");
      setResources(prev);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-semibold text-lg tracking-tight">Resources</h2>
        <p className="max-w-prose text-muted-foreground text-sm">
          Long-lived things your agents have made on previous runs - Notion pages, sheets, Airtable bases, Slack channels, and so on. Decide per item whether the agent can keep editing it, can only read it, or shouldn&apos;t touch it at all.
        </p>
      </div>

      <div className="rounded-xl border bg-foreground/[0.02] p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="font-medium">Want the agent to fill a new dataset?</div>
            <p className="max-w-prose text-foreground/60 text-xs">
              Create an App on the Apps page (a CRM, a list, a tracker - whatever the agent should keep adding rows to). Apps are first-class inside Basics, so the agent can write to them without an extra OAuth step.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/apps">Open Apps</Link>
          </Button>
        </div>
      </div>

      {resources.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-foreground/[0.02] p-10 text-center text-foreground/60 text-sm">
          <Folder className="mx-auto mb-3 size-8 text-foreground/40" />
          Nothing here yet. When your agents create a Notion page, a Google Doc, an Airtable base, etc., it&apos;ll show up here so you can decide what they&apos;re allowed to do with it next time.
        </div>
      ) : (
        <div className="space-y-2">
          {resources.map((r) => (
            <ResourceRow
              key={r.id}
              resource={r}
              onPatch={(body) => void patchResource(r.id, body)}
              onDelete={() => void deleteResource(r.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  resource,
  onPatch,
  onDelete,
}: {
  resource: Resource;
  onPatch: (body: Partial<Pick<Resource, "name" | "url" | "externalId" | "description" | "agentAccess" | "toolkitSlug">>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(resource.name);
  const [url, setUrl] = useState(resource.url ?? "");
  const [description, setDescription] = useState(resource.description ?? "");

  function save() {
    const body: Parameters<typeof onPatch>[0] = {};
    if (name !== resource.name) body.name = name;
    if (url !== (resource.url ?? "")) body.url = url || null;
    if (description !== (resource.description ?? "")) body.description = description || null;
    if (Object.keys(body).length > 0) onPatch(body);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground/5 text-foreground/60">
          <Folder className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 max-w-xs" />
            ) : (
              <div className="truncate font-medium text-sm">{resource.name}</div>
            )}
            <Badge variant="outline" className="h-5 font-normal text-xs">{resource.kind}</Badge>
            {resource.source === "agent_created" ? (
              <Badge variant="secondary" className="h-5 font-normal text-xs">Agent-created</Badge>
            ) : null}
          </div>
          {editing ? (
            <div className="space-y-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" className="h-8 text-xs" />
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes for the agent" className="h-8 text-xs" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {resource.url ? (
                <a href={resource.url} target="_blank" rel="noreferrer" className="block truncate text-foreground/60 text-xs hover:underline">
                  {resource.url}
                </a>
              ) : null}
              {resource.description ? <div className="text-foreground/55 text-xs">{resource.description}</div> : null}
              {resource.externalId ? (
                <div className="font-mono text-foreground/40 text-xs">id: {resource.externalId}</div>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <NativeSelect
              value={resource.agentAccess}
              onChange={(e) => onPatch({ agentAccess: e.target.value as AgentAccess })}
              className="h-7 text-xs"
              aria-label="Agent access"
            >
              <NativeSelectOption value="read_write">Read + write</NativeSelectOption>
              <NativeSelectOption value="read">Read-only</NativeSelectOption>
              <NativeSelectOption value="none">Off-limits</NativeSelectOption>
            </NativeSelect>
            <Badge variant={ACCESS_VARIANT[resource.agentAccess]} className="h-5 font-normal text-xs">
              {ACCESS_LABEL[resource.agentAccess]}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditing(false); setName(resource.name); setUrl(resource.url ?? ""); setDescription(resource.description ?? ""); }}>Cancel</Button>
                <Button size="sm" className="h-7 px-2 text-xs" onClick={save}>Save</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>Edit</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-foreground/60 hover:text-destructive" onClick={onDelete}>
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
