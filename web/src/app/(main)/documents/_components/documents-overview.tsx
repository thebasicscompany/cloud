"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ChevronRight, Clock, Download, Loader2, Pencil, Plus, Trash2 } from "@/icons";
import { resolveAppIcon } from "@/lib/app-icons";

import { MarkdownLite } from "@/components/markdown-lite";
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
import { Textarea } from "@/components/ui/textarea";
import type { DocDetail, DocSummary } from "@/lib/documents-data";

export function DocumentsOverview({ documents }: { documents: DocSummary[] }) {
  const { refresh } = useRouter();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {documents.map((doc) => (
          <DocCard key={doc.id} doc={doc} onOpen={() => setOpenSlug(doc.slug)} />
        ))}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="size-5" />
          <span className="font-medium text-sm">New document</span>
        </button>
      </div>

      {documents.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No documents yet. Write one, or let an automation draft a report or plan and it will land here.
        </p>
      ) : null}

      {openSlug ? (
        <DocReader
          slug={openSlug}
          onClose={() => {
            setOpenSlug(null);
            refresh();
          }}
        />
      ) : null}

      {creating ? (
        <CreateDocDialog
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

function DocCard({ doc, onOpen }: { doc: DocSummary; onOpen: () => void }) {
  const Icon = resolveAppIcon({ icon: doc.icon, name: doc.title });
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-[132px] min-w-0 flex-col gap-2 overflow-hidden rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" weight="duotone" />
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {doc.pinned ? <Badge variant="outline">Pinned</Badge> : null}
          <Badge variant={doc.status === "draft" ? "secondary" : "outline"}>{doc.status}</Badge>
        </div>
      </div>
      <div className="w-full min-w-0 flex-1">
        <div className="truncate font-semibold">{doc.title}</div>
        <p className="mt-0.5 line-clamp-2 text-muted-foreground text-sm">{doc.summary}</p>
      </div>
      <div className="flex w-full items-center justify-between gap-2 border-t pt-2 text-muted-foreground text-xs">
        <span className="min-w-0 flex-1 truncate">{doc.source.label}</span>
        <span className="flex shrink-0 items-center gap-1 font-medium text-foreground transition-transform group-hover:translate-x-0.5">
          Open
          <ChevronRight className="size-3.5" />
        </span>
      </div>
    </button>
  );
}

function DocReader({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${slug}`);
      const json = await res.json();
      if (res.ok && json.document) setDoc(json.document as DocDetail);
      else setError(json.error ?? "Could not load this document.");
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

  const Icon = doc ? resolveAppIcon({ icon: doc.icon, name: doc.title }) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="flex-row items-start gap-3 border-b p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {Icon ? <Icon className="size-5" weight="duotone" /> : <Loader2 className="size-5 animate-spin" />}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate">{doc?.title ?? "Loading…"}</DialogTitle>
            <DialogDescription className="truncate">
              {doc ? `${doc.source.label} · ${doc.status}` : ""}
            </DialogDescription>
          </div>
          {doc ? (
            <div className="mr-8 flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  // Generate a .md file from the document body and trigger a
                  // download. No server round-trip - the body is already in
                  // memory. Filename uses the slug so the user gets a stable
                  // name even if the title has weird characters.
                  const blob = new Blob([doc.body], { type: "text/markdown;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${doc.slug || "document"}.md`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download className="size-4" />
                Download
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
            </div>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : doc ? (
            <>
              {doc.actions.length > 0 ? (
                <div className="mb-4 space-y-2">
                  {doc.actions.map((a, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
                      <span className="text-sm">{a.label ?? a.kind ?? "Action"}</span>
                      <Badge variant="outline">{a.status ?? "pending"}</Badge>
                    </div>
                  ))}
                </div>
              ) : null}
              <MarkdownLite text={doc.body} />
            </>
          ) : null}
        </div>
      </DialogContent>

      {doc && editing ? (
        <EditDocDialog
          doc={doc}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      ) : null}
    </Dialog>
  );
}

function EditDocDialog({ doc, onClose, onSaved }: { doc: DocDetail; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(doc.title);
  const [summary, setSummary] = useState(doc.summary);
  const [body, setBody] = useState(doc.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, summary, body, status: "ready" }),
      });
      const json = await res.json();
      if (res.ok && json.ok) onSaved();
      else setError(json.error ?? "Could not save.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
          <DialogDescription>Markdown supported (#, **bold**, - lists).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 overflow-auto">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-72 font-mono text-xs" />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDocDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, summary, body }),
      });
      const json = await res.json();
      if (res.ok && json.ok) onCreated(json.slug as string);
      else setError(json.error ?? "Could not create the document.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>A long-form doc you and your agents can read and edit.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Q2 GTM Plan)" />
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-52 font-mono text-xs" placeholder="# Heading&#10;&#10;Body in markdown…" />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void create()} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
