import { getInvitationPreview } from "@/lib/invitations";

import { AcceptInvite } from "./accept-invite";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await getInvitationPreview(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          basichome invitation
        </div>
        {!preview ? (
          <>
            <h1 className="text-lg font-semibold">Invitation not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite link is invalid. Ask the workspace owner to send a new one.
            </p>
          </>
        ) : preview.status === "accepted" ? (
          <>
            <h1 className="text-lg font-semibold">Already accepted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {preview.email} is already a member of {preview.workspaceName}.
            </p>
          </>
        ) : preview.status !== "pending" || preview.expired ? (
          <>
            <h1 className="text-lg font-semibold">Invitation {preview.expired ? "expired" : preview.status}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask the workspace owner to send a new invite.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Join {preview.workspaceName}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;ve been invited as <span className="font-medium text-foreground">{preview.role}</span> using{" "}
              <span className="font-medium text-foreground">{preview.email}</span>.
            </p>
            <div className="mt-6">
              <AcceptInvite token={token} workspaceName={preview.workspaceName} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
