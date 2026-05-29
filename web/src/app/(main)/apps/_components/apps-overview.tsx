"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Board, ChevronRight, Clock, LayoutGrid, ListIcon, Loader2, Pencil, Plus, TableIcon, Trash2, X } from "@/icons";
import { APP_ICON_CHOICES, resolveAppIcon } from "@/lib/app-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { AppDetail, AppField, AppKind, AppRecord, AppSummary } from "@/lib/apps-data";

const KIND_ICON: Record<AppKind, typeof Board> = { board: Board, table: TableIcon, list: ListIcon };

export function AppsOverview({ apps }: { apps: AppSummary[] }) {
  const { refresh } = useRouter();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((app) => (
          <AppCard key={app.id} app={app} onOpen={() => setOpenSlug(app.slug)} />
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="size-5" />
          <span className="font-medium text-sm">New app</span>
        </button>
      </div>

      {apps.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No apps yet. Create one, or let an agent build a CRM, digest, or list and drop its outputs here.
        </p>
      ) : null}

      {openSlug ? (
        <AppPanel
          slug={openSlug}
          onClose={() => {
            setOpenSlug(null);
            refresh();
          }}
        />
      ) : null}

      {creating ? (
        <CreateAppDialog
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            setCreating(false);
            refresh();
            setOpenSlug(slug);
          }}
        />
      ) : null}
    </>
  );
}

function AppCard({ app, onOpen }: { app: AppSummary; onOpen: () => void }) {
  const KindIcon = KIND_ICON[app.kind] ?? TableIcon;
  const AppIcon = resolveAppIcon(app);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-[140px] flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <AppIcon className="size-5" weight="duotone" />
        </span>
        <Badge variant="outline" className="gap-1">
          <KindIcon className="size-3" />
          {app.kind}
        </Badge>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{app.name}</div>
        <p className="mt-0.5 line-clamp-2 text-muted-foreground text-sm">{app.description}</p>
      </div>
      <div className="flex items-center justify-between border-t pt-2 text-muted-foreground text-xs">
        <span>
          {app.recordCount} record{app.recordCount === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1 font-medium text-foreground transition-transform group-hover:translate-x-0.5">
          Open
          <ChevronRight className="size-3.5" />
        </span>
      </div>
    </button>
  );
}

function AppPanel({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AppRecord | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/apps/${slug}`);
      const json = await res.json();
      if (res.ok && json.app) setApp(json.app as AppDetail);
      else setError(json.error ?? "Could not load this app.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function deleteRecord(id: string) {
    await fetch(`/api/apps/${slug}/records/${id}`, { method: "DELETE" });
    setApp((prev) => (prev ? { ...prev, records: prev.records.filter((r) => r.id !== id) } : prev));
  }

  const AppIcon = app ? resolveAppIcon(app) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[calc(100%-2rem)] max-w-5xl flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="flex-row items-start gap-3 border-b p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {AppIcon ? <AppIcon className="size-5" weight="duotone" /> : <Loader2 className="size-5 animate-spin" />}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{app?.name ?? "Loading…"}</DialogTitle>
            <DialogDescription className="truncate">{app?.description}</DialogDescription>
          </div>
          {app ? (
            <Button type="button" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add record
            </Button>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : app && app.records.length === 0 ? (
            <div className="grid place-items-center rounded-lg border border-dashed p-10 text-center text-muted-foreground text-sm">
              <div>
                <p>No records yet.</p>
                <p className="mt-1">Add one yourself, or an agent will drop outputs here.</p>
              </div>
            </div>
          ) : app ? (
            <AppRecordsView app={app} onEdit={setEditing} onDelete={(id) => void deleteRecord(id)} />
          ) : null}
        </div>
      </DialogContent>

      {app && (adding || editing) ? (
        <RecordDialog
          app={app}
          record={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </Dialog>
  );
}

function AppRecordsView({
  app,
  onEdit,
  onDelete,
}: {
  app: AppDetail;
  onEdit: (r: AppRecord) => void;
  onDelete: (id: string) => void;
}) {
  if (app.kind === "board") {
    const stages = app.view.stages ?? Array.from(new Set(app.records.map((r) => r.status ?? "Other")));
    const titleField = app.view.titleField ?? app.fields[0]?.key;
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((stage) => {
          const inStage = app.records.filter((r) => (r.status ?? "Other") === stage);
          return (
            <div key={stage} className="flex w-72 shrink-0 flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-medium text-sm">{stage}</span>
                <Badge variant="outline">{inStage.length}</Badge>
              </div>
              {inStage.map((r) => (
                <RecordCard key={r.id} app={app} record={r} titleField={titleField} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  if (app.kind === "list") {
    const titleField = app.view.titleField ?? app.fields[0]?.key;
    const bodyField = app.view.bodyField;
    return (
      <div className="space-y-2">
        {app.records.map((r) => (
          <div key={r.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{String(r.data[titleField ?? ""] ?? "Untitled")}</div>
                {bodyField ? (
                  <p className="mt-0.5 text-muted-foreground text-sm">{String(r.data[bodyField] ?? "")}</p>
                ) : null}
              </div>
              <RecordActions record={r} onEdit={onEdit} onDelete={onDelete} />
            </div>
            <RecordMeta record={r} />
          </div>
        ))}
      </div>
    );
  }

  // table
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {app.fields.map((f) => (
              <th key={f.key} className="px-3 py-2 text-left font-medium">
                {f.label}
              </th>
            ))}
            <th className="px-3 py-2 text-left font-medium">Source</th>
            <th className="w-20 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {app.records.map((r) => (
            <tr key={r.id} className="border-t">
              {app.fields.map((f) => (
                <td key={f.key} className="max-w-[220px] truncate px-3 py-2">
                  {String(r.data[f.key] ?? "")}
                </td>
              ))}
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-xs">
                  {r.source.label}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right">
                <RecordActions record={r} onEdit={onEdit} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordCard({
  app,
  record,
  titleField,
  onEdit,
  onDelete,
}: {
  app: AppDetail;
  record: AppRecord;
  titleField?: string;
  onEdit: (r: AppRecord) => void;
  onDelete: (id: string) => void;
}) {
  const secondary = app.fields.filter((f) => f.key !== titleField).slice(0, 2);
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-medium text-sm">{String(record.data[titleField ?? ""] ?? "Untitled")}</div>
        <RecordActions record={record} onEdit={onEdit} onDelete={onDelete} />
      </div>
      {secondary.map((f) => (
        <div key={f.key} className="mt-1 truncate text-muted-foreground text-xs">
          {String(record.data[f.key] ?? "")}
        </div>
      ))}
      <RecordMeta record={record} />
    </div>
  );
}

function RecordActions({
  record,
  onEdit,
  onDelete,
}: {
  record: AppRecord;
  onEdit: (r: AppRecord) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <button type="button" onClick={() => onEdit(record)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Edit">
        <Pencil className="size-3.5" />
      </button>
      <button type="button" onClick={() => onDelete(record.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete">
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function RecordMeta({ record }: { record: AppRecord }) {
  return (
    <div className="mt-2 flex items-center gap-1.5 text-muted-foreground text-[11px]">
      <Clock className="size-3" />
      {record.source.label}
    </div>
  );
}

function RecordDialog({
  app,
  record,
  onClose,
  onSaved,
}: {
  app: AppDetail;
  record: AppRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of app.fields) init[f.key] = record ? String(record.data[f.key] ?? "") : "";
    return init;
  });
  const [status, setStatus] = useState<string>(
    record?.status ?? (app.kind === "board" ? app.view.stages?.[0] ?? "" : ""),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const data: Record<string, string> = {};
      for (const f of app.fields) if (values[f.key]?.trim()) data[f.key] = values[f.key].trim();
      const url = record ? `/api/apps/${app.slug}/records/${record.id}` : `/api/apps/${app.slug}/records`;
      const res = await fetch(url, {
        method: record ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data, status: app.kind === "board" ? status : undefined }),
      });
      const json = await res.json();
      if (res.ok && json.ok) onSaved();
      else setError(json.error ?? "Could not save the record.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{record ? "Edit record" : "Add record"}</DialogTitle>
          <DialogDescription>
            {record ? "Update this record." : `Add a record to ${app.name}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {app.kind === "board" && app.view.stages?.length ? (
            <div className="space-y-1.5">
              <label htmlFor="record-status" className="font-medium text-sm">
                Stage
              </label>
              <NativeSelect id="record-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
                {app.view.stages.map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {s}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          {app.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={values[f.key] ?? ""} onChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} />
          ))}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {record ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({ field, value, onChange }: { field: AppField; value: string; onChange: (v: string) => void }) {
  const long = field.type === "text" && (field.key === "notes" || field.key === "summary" || field.key === "body");
  return (
    <div className="space-y-1.5">
      <label htmlFor={`field-${field.key}`} className="font-medium text-sm">
        {field.label}
      </label>
      {long ? (
        <Textarea id={`field-${field.key}`} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-20 resize-none" />
      ) : (
        <Input
          id={`field-${field.key}`}
          type={field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

interface DraftField {
  key: string;
  label: string;
  type: string;
}

function CreateAppDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("package");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<AppKind>("table");
  const [fields, setFields] = useState<DraftField[]>([
    { key: "title", label: "Title", type: "text" },
    { key: "notes", label: "Notes", type: "text" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField(i: number, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addField() {
    setFields((prev) => [...prev, { key: `field${prev.length + 1}`, label: "", type: "text" }]);
  }

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const cleanFields = fields
        .map((f) => ({ key: f.key.trim(), label: f.label.trim() || f.key.trim(), type: f.type }))
        .filter((f) => f.key);
      const view =
        kind === "board"
          ? { groupBy: "status", titleField: cleanFields[0]?.key, stages: ["New", "In progress", "Done"] }
          : kind === "list"
            ? { titleField: cleanFields[0]?.key, bodyField: cleanFields[1]?.key }
            : {};
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, icon, description, kind, fields: cleanFields, view }),
      });
      const json = await res.json();
      if (res.ok && json.ok) onCreated(json.slug as string);
      else setError(json.error ?? "Could not create the app.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const KIND_OPTS: { value: AppKind; label: string; icon: typeof Board }[] = [
    { value: "table", label: "Table", icon: TableIcon },
    { value: "board", label: "Board", icon: Board },
    { value: "list", label: "List / feed", icon: ListIcon },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="size-4" />
            New app
          </DialogTitle>
          <DialogDescription>A typed surface your runs, automations, and you can write to and read from.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="app-name" className="font-medium text-sm">
              Name
            </label>
            <Input id="app-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GTM CRM" />
          </div>
          <div className="space-y-1.5">
            <span className="font-medium text-sm">Icon</span>
            <div className="flex flex-wrap gap-1.5">
              {APP_ICON_CHOICES.map(({ name: iconName, Icon }) => {
                const active = icon === iconName;
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setIcon(iconName)}
                    aria-label={iconName}
                    className={`grid size-9 place-items-center rounded-lg border transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                  >
                    <Icon className="size-5" weight={active ? "duotone" : "regular"} />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="app-desc" className="font-medium text-sm">
              Description
            </label>
            <Input id="app-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What goes in here?" />
          </div>
          <div className="space-y-1.5">
            <span className="font-medium text-sm">View</span>
            <div className="grid grid-cols-3 gap-2">
              {KIND_OPTS.map((opt) => {
                const Icon = opt.icon;
                const active = kind === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setKind(opt.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs ${active ? "border-primary bg-primary/5 text-foreground" : "text-muted-foreground hover:border-primary/40"}`}
                  >
                    <Icon className="size-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Fields</span>
              <Button type="button" size="sm" variant="ghost" onClick={addField}>
                <Plus className="size-3.5" />
                Add field
              </Button>
            </div>
            {fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={f.label} onChange={(e) => updateField(i, { label: e.target.value, key: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || f.key })} placeholder="Field label" className="flex-1" />
                <NativeSelect value={f.type} onChange={(e) => updateField(i, { type: e.target.value })} className="w-28">
                  <NativeSelectOption value="text">Text</NativeSelectOption>
                  <NativeSelectOption value="email">Email</NativeSelectOption>
                  <NativeSelectOption value="url">URL</NativeSelectOption>
                  <NativeSelectOption value="number">Number</NativeSelectOption>
                  <NativeSelectOption value="date">Date</NativeSelectOption>
                </NativeSelect>
                <button type="button" onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remove field">
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void create()} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Create app
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
