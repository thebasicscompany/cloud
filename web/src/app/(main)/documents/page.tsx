import type { Metadata } from "next";

import { getDocuments } from "@/lib/documents-data";

import { DocumentsOverview } from "./_components/documents-overview";

export const metadata: Metadata = {
  title: "Documents | basichome",
  description: "Long-form documents your agents and automations write for you to review.",
};

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const documents = await getDocuments();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Documents</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Reports, drafts, and plans your agents and automations write for you to review, edit, and act
          on. You can write your own too, and your agents can read them back.
        </p>
      </header>
      <DocumentsOverview documents={documents} />
    </div>
  );
}
