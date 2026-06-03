"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Folder, Plus, Trash2 } from "@/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/**
 * Workspace resources - long-lived apps / docs / etc. the agent should know
 * about across runs. Each row exposes the three dials the user needs:
 *   - Edit name / URL / description
 *   - Change agent_access (read_write | read | none)
 *   - Delete
 *
 * "Add resource" creates a user_added row. Agent-created rows show their
 * source badge so the user can tell what the agents have made for them.
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

const KIND_PRESETS = [
  "notion_page",
  "notion_database",
  "google_doc",
  "google_sheet",
  "google_drive_folder",
  "airtable_base",
  "slack_channel",
  "linear_project",
  "github_repo",
  "other",
];

export function ResourcesView({ initialResources }: { initialResources: Resource[] }) {
  const [resources, setResources] = useState<Resource[]>(initialResources);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ kind: string; name: string; url: string; externalId: string; description: string }>({
    kind: "notion_page",
    name: "",
    url: "",
    externalId: "",
    description: "",
  });

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

  async function addResource() {
    if (!draft.name.trim() || !draft.kind.trim()) {
      toast.error("Give it a name and a kind.");
      return;
    }
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: draft.kind.trim().toLowerCase(),
          name: draft.name.trim(),
          url: draft.url.trim() || undefined,
          externalId: draft.externalId.trim() || undefined,
          description: draft.description.trim() || undefined,
          source: "user_added",
          agentAccess: "read_write",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { resource?: Resource; error?: string };
      if (!res.ok || !json.resource) throw new Error(json.error ?? "add failed");
      setResources([json.resource, ...resources]);
      setDraft({ kind: "notion_page", name: "", url: "", externalId: "", description: "" });
      setAdding(false);
      toast.success(`Added ${json.resource.name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add resource");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg tracking-tight">Resources</h2>
          <p className="max-w-prose text-muted-foreground text-sm">
            Long-lived apps and docs your agents should know about - both things they&apos;ve made on previous runs and ones you point them at. Change what an agent can do per resource, or revoke access entirely.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding((v) => !v)} className="gap-1.5">
          <Plus className="size-4" /> Add resource
        </Button>
      </div>

      {adding ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="r-kind" className="text-xs">Kind</Label>
              <NativeSelect
                id="r-kind"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                {KIND_PRESETS.map((k) => (
                  <NativeSelectOption key={k} value={k}>{k}</NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-name" className="text-xs">Name</Label>
              <Input id="r-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Q3 Leads tracker" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-url" className="text-xs">URL</Label>
              <Input id="r-url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://airtable.com/..." />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-extid" className="text-xs">External ID (optional - the system&apos;s identifier)</Label>
              <Input id="r-extid" value={draft.externalId} onChange={(e) => setDraft({ ...draft, externalId: e.target.value })} placeholder="appBaseId123 / pageId / etc." />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="r-desc" className="text-xs">Notes for the agent (optional)</Label>
              <Input id="r-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Use this for all customer follow-ups" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void addResource()}>Add</Button>
          </div>
        </div>
      ) : null}

      {resources.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-foreground/[0.02] p-10 text-center text-foreground/60 text-sm">
          <Folder className="mx-auto mb-3 size-8 text-foreground/40" />
          No resources yet. Agents will register things they create here so they can edit them on the next run. You can also add ones you&apos;ve already made.
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
