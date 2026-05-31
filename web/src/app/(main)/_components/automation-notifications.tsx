"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Eye } from "@/icons";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCloudAutomations } from "@/hooks/queries/use-cloud-automations";

/**
 * Watches for newly-created automations and surfaces a prominent, centered
 * announcement when a dry-run preview starts. A draft never runs on its own,
 * and the dry-run otherwise fires with no obvious indication — a small
 * bottom-right toast was too easy to miss. This pops a centered modal so the
 * user actually notices, and offers a one-click jump to watch it live.
 * Decoupled from the authoring chat so it fires no matter how the automation
 * was created.
 */
export function AutomationNotifications() {
  const { data } = useCloudAutomations();
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const [announce, setAnnounce] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    // First load: snapshot existing automations WITHOUT announcing, so opening
    // the app doesn't pop a modal. Anything new after that is genuinely
    // just-created.
    if (seen.current === null) {
      seen.current = new Set(data.map((a) => a.id));
      return;
    }
    for (const a of data) {
      if (seen.current.has(a.id)) continue;
      seen.current.add(a.id);
      if (a.status === "draft") {
        setAnnounce({ id: a.id, name: a.name });
      }
    }
  }, [data]);

  const watchLive = () => {
    const id = announce?.id;
    setAnnounce(null);
    if (id) router.push(`/automations/${id}`);
  };

  return (
    <Dialog open={!!announce} onOpenChange={(open) => !open && setAnnounce(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center">
          <div className="mb-1 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Eye className="size-6" />
          </div>
          <DialogTitle className="text-center text-lg">Dry-run preview started</DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-medium text-foreground">“{announce?.name}”</span> is running a
            dry-run right now — a safe pass with no real side-effects, so you can see exactly what it
            will do. Activate it once the preview looks right.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-center">
          <Button variant="outline" onClick={() => setAnnounce(null)}>
            Got it
          </Button>
          <Button onClick={watchLive}>
            <Eye className="size-4" />
            Watch it live
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
