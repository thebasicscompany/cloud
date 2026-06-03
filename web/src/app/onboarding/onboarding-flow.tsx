"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ArrowRight, Check, Microphone, Monitor, X } from "@phosphor-icons/react";

import { BasicsOrb } from "@/components/basics-orb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BASICHOME_ONBOARDING_STORAGE_KEY,
  detectClientOS,
  type BasichomeOnboardingRecordV2,
} from "@/lib/onboarding";

// Onboarding philosophy (post-overhaul):
//   - Five steps, never more. Each step asks for one thing.
//   - No paragraphs. A heading, one sentence of context, one primary action.
//   - Active, not passive: permissions get LIVE probes + Settings deep-links;
//     the first-agent step prefills a draft for the user instead of a tour.
//   - Web (no Electron) skips the permissions step entirely - the browser
//     prompts inline when it needs mic/screen access.
//
// Visual reference: Willow / Wispr Flow / Cluely. Single column, soft
// background, bold heading + small subtext, one big primary CTA.

type StepId = "welcome" | "permissions" | "workspace" | "first_agent" | "ready";

interface PermissionState {
  screen: PermissionStatus;
  microphone: PermissionStatus;
  accessibility: PermissionStatus;
}

type PermissionStatus =
  | "granted"
  | "denied"
  | "not-determined"
  | "restricted"
  | "unknown";

interface BasichomeBridge {
  isDesktop?: boolean;
  platform?: string;
  permStatus?: () => Promise<PermissionState & { error?: string }>;
  permRequestMic?: () => Promise<{ ok: boolean; granted?: boolean; error?: string }>;
  permOpen?: (which: "screen" | "microphone" | "accessibility") => Promise<unknown>;
}

const SUGGESTED_SEEDS = [
  "Every morning, summarize the unread emails in my Gmail inbox and post the digest to Slack #me",
  "When a Linear ticket moves into 'In review', notify me with the linked PR + the last 3 comments",
  "Once a week, pull new leads from HubSpot and draft a follow-up email I can review",
];

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("welcome");
  const [workspaceName, setWorkspaceName] = useState("My workspace");
  const [agentSeed, setAgentSeed] = useState("");
  const [perms, setPerms] = useState<PermissionState>({
    screen: "unknown",
    microphone: "unknown",
    accessibility: "unknown",
  });

  const bh =
    typeof window !== "undefined"
      ? ((window as unknown as { basichome?: BasichomeBridge }).basichome ?? null)
      : null;
  const isElectron = Boolean(bh?.isDesktop);
  const os = useMemo(() => detectClientOS(), []);

  // Steps depend on platform: web skips the permissions screen because the
  // browser handles getUserMedia / getDisplayMedia prompts inline whenever
  // the user first records. On Electron we walk them through the OS panels.
  const steps: StepId[] = useMemo(
    () =>
      isElectron
        ? ["welcome", "permissions", "workspace", "first_agent", "ready"]
        : ["welcome", "workspace", "first_agent", "ready"],
    [isElectron],
  );
  const stepIdx = steps.indexOf(step);

  // Probe Electron permission state on mount + whenever we enter the
  // permissions step. The status auto-refreshes when the user comes back
  // from System Settings - we poll while on this step to pick up grants
  // they made out of band.
  useEffect(() => {
    if (!bh?.permStatus) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await bh.permStatus!();
        if (!cancelled) setPerms({ screen: s.screen, microphone: s.microphone, accessibility: s.accessibility });
      } catch { /* ignore */ }
    };
    void tick();
    if (step !== "permissions") return;
    const t = setInterval(tick, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [bh, step]);

  function advance() {
    const i = steps.indexOf(step);
    const next = steps[i + 1];
    if (next) setStep(next);
  }

  function finish() {
    const record: BasichomeOnboardingRecordV2 = {
      schemaVersion: 2,
      completedAt: new Date().toISOString(),
      workspace: { name: workspaceName.trim() || "My workspace" },
      firstAgentSeed: agentSeed.trim() || undefined,
      permissions: isElectron
        ? {
            screen: mapPerm(perms.screen),
            microphone: mapPerm(perms.microphone),
            accessibility: mapPerm(perms.accessibility),
          }
        : undefined,
    };
    window.localStorage.setItem(BASICHOME_ONBOARDING_STORAGE_KEY, JSON.stringify(record));
    const next = new URLSearchParams(window.location.search).get("next");
    const dest = next?.startsWith("/") ? next : agentSeed.trim()
      ? `/agents/new?goal=${encodeURIComponent(agentSeed.trim())}`
      : "/agents";
    router.push(dest);
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-gradient-to-b from-background via-background to-foreground/[0.02] text-foreground">
      <div className="mx-auto flex min-h-svh w-full max-w-xl flex-col px-6 py-10">
        <ProgressDots count={steps.length} active={stepIdx} />
        <div className="flex flex-1 items-center">
          <div className="w-full">
            {step === "welcome" ? (
              <WelcomeStep onContinue={advance} />
            ) : step === "permissions" ? (
              <PermissionsStep
                perms={perms}
                bridge={bh}
                os={os}
                onContinue={advance}
              />
            ) : step === "workspace" ? (
              <WorkspaceStep
                value={workspaceName}
                onChange={setWorkspaceName}
                onContinue={advance}
              />
            ) : step === "first_agent" ? (
              <FirstAgentStep
                value={agentSeed}
                onChange={setAgentSeed}
                onContinue={advance}
              />
            ) : (
              <ReadyStep onFinish={finish} workspaceName={workspaceName} hasAgent={Boolean(agentSeed.trim())} />
            )}
          </div>
        </div>
        <div className="pt-4 text-center text-foreground/40 text-xs">Basics</div>
      </div>
    </main>
  );
}

function mapPerm(s: PermissionStatus): "granted" | "skipped" | "not_started" {
  if (s === "granted") return "granted";
  if (s === "denied" || s === "restricted") return "skipped";
  return "not_started";
}

function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 rounded-full transition-all duration-300",
            i === active ? "w-8 bg-foreground" : i < active ? "w-2 bg-foreground/40" : "w-2 bg-foreground/10",
          )}
        />
      ))}
    </div>
  );
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <BasicsOrb size={88} />
      <div className="space-y-3">
        <h1 className="font-semibold text-4xl tracking-tight">Basics</h1>
        <p className="text-foreground/60 text-base">Agents that actually do the work.</p>
      </div>
      <Button size="lg" className="h-12 w-full max-w-xs gap-2 text-base" onClick={onContinue}>
        Get started <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function PermissionsStep({
  perms,
  bridge,
  os,
  onContinue,
}: {
  perms: PermissionState;
  bridge: BasichomeBridge | null;
  os: ReturnType<typeof detectClientOS>;
  onContinue: () => void;
}) {
  // Accessibility only matters on macOS - it's what unlocks the per-frame
  // app/window/URL context the Record-a-demo flow uses to ground frames in
  // their app. On Windows the equivalent isn't a separate system grant.
  const showAccessibility = os === "mac";
  const allGranted =
    perms.screen === "granted" &&
    perms.microphone === "granted" &&
    (!showAccessibility || perms.accessibility === "granted");

  return (
    <div className="space-y-7">
      <div className="space-y-2 text-center">
        <h1 className="font-semibold text-2xl tracking-tight">Give Basics access</h1>
        <p className="text-foreground/60 text-sm">
          Basics needs these to watch your screen and hear you talk it through your work.
        </p>
      </div>

      <div className="space-y-2">
        <PermissionTile
          icon={<Monitor weight="fill" className="size-5" />}
          title="Screen recording"
          subtitle="So Basics can see what you do."
          status={perms.screen}
          onAllow={() => void bridge?.permOpen?.("screen")}
        />
        <PermissionTile
          icon={<Microphone weight="fill" className="size-5" />}
          title="Microphone"
          subtitle="So Basics can hear you talk it through."
          status={perms.microphone}
          onAllow={async () => {
            // Mic on macOS prompts inline first time; if denied, deep-link
            // them into the Privacy panel.
            const r = await bridge?.permRequestMic?.();
            if (r && r.granted === false) {
              void bridge?.permOpen?.("microphone");
            }
          }}
        />
        {showAccessibility ? (
          <PermissionTile
            icon={<span aria-hidden className="grid size-5 place-items-center font-bold text-sm">A</span>}
            title="Accessibility"
            subtitle="So Basics knows which app + URL each frame is in."
            status={perms.accessibility}
            onAllow={() => void bridge?.permOpen?.("accessibility")}
          />
        ) : null}
      </div>

      <Button
        size="lg"
        className="h-12 w-full gap-2 text-base"
        onClick={onContinue}
        disabled={!allGranted}
      >
        {allGranted ? (
          <>Continue <ArrowRight className="size-4" /></>
        ) : (
          "Allow the items above to continue"
        )}
      </Button>
      <button
        type="button"
        onClick={onContinue}
        className="block w-full text-center text-foreground/40 text-xs hover:text-foreground/60"
      >
        Skip for now
      </button>
    </div>
  );
}

function PermissionTile({
  icon,
  title,
  subtitle,
  status,
  onAllow,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status: PermissionStatus;
  onAllow: () => void | Promise<void>;
}) {
  const ok = status === "granted";
  const denied = status === "denied" || status === "restricted";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors",
        ok && "border-emerald-500/40 bg-emerald-500/5",
        denied && "border-destructive/30 bg-destructive/5",
      )}
    >
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg text-foreground/70",
          ok ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-foreground/5",
        )}
      >
        {ok ? <Check weight="bold" className="size-5" /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm">{title}</div>
        <div className="truncate text-foreground/55 text-xs">{subtitle}</div>
      </div>
      {ok ? (
        <span className="text-emerald-700 text-xs dark:text-emerald-300">Allowed</span>
      ) : (
        <Button size="sm" variant={denied ? "outline" : "default"} onClick={() => void onAllow()}>
          {denied ? (
            <>
              <X className="size-3.5" /> Open Settings
            </>
          ) : (
            "Allow"
          )}
        </Button>
      )}
    </div>
  );
}

function WorkspaceStep({
  value,
  onChange,
  onContinue,
}: {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div className="space-y-7">
      <div className="space-y-2 text-center">
        <h1 className="font-semibold text-2xl tracking-tight">Name your workspace</h1>
        <p className="text-foreground/60 text-sm">You can change this later in settings.</p>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && value.trim() && onContinue()}
        placeholder="My workspace"
        className="h-14 w-full rounded-2xl border bg-card px-5 text-center font-medium text-lg outline-none ring-2 ring-transparent transition-all focus:border-foreground/30 focus:ring-foreground/10"
        maxLength={60}
      />
      <Button
        size="lg"
        className="h-12 w-full gap-2 text-base"
        onClick={onContinue}
        disabled={!value.trim()}
      >
        Continue <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function FirstAgentStep({
  value,
  onChange,
  onContinue,
}: {
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    taRef.current?.focus();
  }, []);
  return (
    <div className="space-y-7">
      <div className="space-y-2 text-center">
        <h1 className="font-semibold text-2xl tracking-tight">What should your first agent do?</h1>
        <p className="text-foreground/60 text-sm">A sentence is enough - Basics will draft the rest.</p>
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Every morning, summarize the new leads from HubSpot and email me a digest..."
        className="min-h-32 w-full resize-none rounded-2xl border bg-card p-4 text-sm outline-none ring-2 ring-transparent transition-all focus:border-foreground/30 focus:ring-foreground/10"
        maxLength={500}
      />
      <div className="space-y-2">
        <div className="text-foreground/50 text-xs">Try one of these:</div>
        <div className="flex flex-col gap-1.5">
          {SUGGESTED_SEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="rounded-lg border bg-card p-2.5 text-left text-foreground/70 text-xs transition-colors hover:border-foreground/30 hover:bg-foreground/5 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="flex-1 text-foreground/40 text-xs hover:text-foreground/60"
        >
          Skip
        </button>
        <Button
          size="lg"
          className="h-12 flex-[2] gap-2 text-base"
          onClick={onContinue}
        >
          Continue <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ReadyStep({
  onFinish,
  workspaceName,
  hasAgent,
}: {
  onFinish: () => void;
  workspaceName: string;
  hasAgent: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <BasicsOrb size={88} pending />
      <div className="space-y-3">
        <h1 className="font-semibold text-3xl tracking-tight">You&apos;re set</h1>
        <p className="text-foreground/60 text-sm">
          {hasAgent
            ? `Basics will start drafting your agent in ${workspaceName}.`
            : `${workspaceName} is ready when you are.`}
        </p>
      </div>
      <Button size="lg" className="h-12 w-full max-w-xs gap-2 text-base" onClick={onFinish}>
        {hasAgent ? "Build my agent" : "Enter Basics"} <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
