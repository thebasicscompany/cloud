"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function AcceptInvite({ token, workspaceName }: { token: string; workspaceName: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function accept() {
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch("/api/team/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (data.ok) {
        setState("done");
        setMessage(`You've joined ${data.workspaceName ?? workspaceName}.`);
      } else {
        setState("error");
        setMessage(data.error ?? "Could not accept invite.");
      }
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  if (state === "done") {
    return <p className="text-sm font-medium text-foreground">{message} You can open Basics now.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={accept} disabled={state === "busy"} className="w-full">
        {state === "busy" ? "Joining…" : `Accept & join ${workspaceName}`}
      </Button>
      {message ? <p className="text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
