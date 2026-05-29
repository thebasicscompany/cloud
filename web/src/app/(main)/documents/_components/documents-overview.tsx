"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ChevronRight, Clock, Loader2, Pencil, Plus, Trash2 } from "@/icons";
import { resolveAppIcon } from "@/lib/app-icons";

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
      className="group flex min-h-[132px] flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" weight="duotone" />
        </span>
        <div className="flex items-center gap-1.5">
          {doc.pinned ? <Badge variant="outline">Pinned</Badge> : null}
          <Badge variant={doc.status === "draft" ? "secondary" : "outline"}>{doc.status}</Badge>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{doc.title}</div>
        <p className="mt-0.5 line-clamp-2 text-muted-foreground text-sm">{doc.summary}</p>
      </div>
      <div className="flex items-center justify-between border-t pt-2 text-muted-foreground text-xs">
        <span className="truncate">{doc.source.label}</span>
        <span className="flex items-center gap-1 font-medium text-foreground transition-transform group-hover:translate-x-0.5">
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
            <Button type="button" size="sm" variant="outline" className="mr-8 shrink-0" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Edit
            </Button>
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

/** Minimal, safe markdown renderer (headings, bold/italic, lists, paragraphs). */
function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <article className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (/^#{1,3}\s/.test(lines[0] ?? "")) {
          const level = (lines[0].match(/^#+/)?.[0].length ?? 1) as 1 | 2 | 3;
          const content = lines[0].replace(/^#+\s/, "");
          const cls = level === 1 ? "font-semibold text-xl" : level === 2 ? "font-semibold text-lg" : "font-medium text-base";
          return (
            <h3 key={i} className={cls}>
              {inline(content)}
            </h3>
          );
        }
        if (lines.every((l) => /^\s*[-*]\s/.test(l) || l.trim() === "")) {
          return (
            <ul key={i} className="ml-5 list-disc space-y-1">
              {lines.filter((l) => l.trim()).map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*]\s/, ""))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+\.\s/.test(l) || l.trim() === "")) {
          return (
            <ol key={i} className="ml-5 list-decimal space-y-1">
              {lines.filter((l) => l.trim()).map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*\d+\.\s/, ""))}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="text-foreground/90">
            {lines.map((l, j) => (
              <span key={j}>
                {inline(l)}
                {j < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </article>
  );
}

/** Inline **bold** / *italic* → React nodes (escaped automatically by React). */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
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
