"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import {
  BadgeCheck,
  Brain,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck2,
  Folder,
  Globe,
  Home,
  KeyRound,
  Lock,
  Mic,
  Monitor,
  MousePointerClick,
  Play,
  Plug,
  ShieldCheck,
  UserCog,
  Workflow,
  type Icon,
} from "@/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  BASICHOME_ONBOARDING_EVENT_KEY,
  BASICHOME_ONBOARDING_STORAGE_KEY,
  type BasichomeOnboardingRecord,
  type ClientOS,
  detectClientOS,
  type OnboardingPermissionStatus,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const STEP_DEFS = [
  {
    id: "welcome",
    title: "Welcome",
    description: "How basichome works, and where to find things.",
  },
  {
    id: "workspace",
    title: "Workspace",
    description: "Create the solo owner/admin boundary.",
  },
  {
    id: "permissions",
    title: "Permissions",
    description: "Make local device access explicit.",
  },
  {
    id: "capture",
    title: "Capture",
    description: "Choose local Lens defaults.",
  },
  {
    id: "engine",
    title: "Engine",
    description: "Pick how the first agent work runs.",
  },
  {
    id: "safety",
    title: "Safety",
    description: "Review approval and trust defaults.",
  },
  {
    id: "review",
    title: "Review",
    description: "Save local setup and enter basichome.",
  },
] as const;

type PermissionDef = {
  id: PermissionId;
  title: string;
  icon: Icon;
  detail: string;
  why: string;
};

// Stable set of permission ids persisted in local setup state. Every OS-specific
// flow renders a subset/relabeling of these ids so the saved record shape never
// changes across platforms.
const PERMISSION_IDS = [
  "screen_recording",
  "accessibility",
  "input_control",
  "audio",
  "browser_profile",
] as const;

const MAC_PERMISSIONS: readonly PermissionDef[] = [
  {
    id: "screen_recording",
    title: "Screen Recording",
    icon: Monitor,
    detail: "Allows Lens to understand visible work. Raw screenshots stay local.",
    why: "Needed for screen context, OCR fallback, and routine demonstrations.",
  },
  {
    id: "accessibility",
    title: "Accessibility",
    icon: MousePointerClick,
    detail: "Lets basichome read UI structure without relying only on screenshots.",
    why: "Needed for efficient local context and precise app understanding.",
  },
  {
    id: "input_control",
    title: "Input Monitoring",
    icon: KeyRound,
    detail: "Lets basichome send keyboard and pointer actions only after user approval.",
    why: "Needed for trusted automations that can complete work across desktop apps.",
  },
  {
    id: "audio",
    title: "Microphone and System Audio",
    icon: Mic,
    detail: "Optional for meetings and spoken context. Local transcription first.",
    why: "Useful for meeting notes and voice instructions.",
  },
  {
    id: "browser_profile",
    title: "Browser Profile",
    icon: Globe,
    detail: "Optional managed local browser login store for browser tasks.",
    why: "Needed when a task should use a saved local browser session.",
  },
];

const WINDOWS_PERMISSIONS: readonly PermissionDef[] = [
  {
    id: "screen_recording",
    title: "Screen capture",
    icon: Monitor,
    detail: "Lets Lens see what's on your screen. Windows asks the first time it's needed, and nothing it sees leaves your computer.",
    why: "Used to understand what you're working on and to record routines you demonstrate.",
  },
  {
    id: "input_control",
    title: "Input monitoring",
    icon: KeyRound,
    detail: "Lets basichome read and send keyboard and pointer actions only after your approval. Windows grants this at use-time, not as a separate setting.",
    why: "Used for trusted automations that can complete work across desktop apps.",
  },
  {
    id: "audio",
    title: "Microphone",
    icon: Mic,
    detail: "Optional for meetings and spoken context. Windows prompts when first used and local transcription comes first.",
    why: "Useful for meeting notes and voice instructions.",
  },
  {
    id: "browser_profile",
    title: "Browser Profile",
    icon: Globe,
    detail: "Optional managed local browser login store for browser tasks.",
    why: "Needed when a task should use a saved local browser session.",
  },
];

function permissionsForOS(os: ClientOS): readonly PermissionDef[] {
  return os === "windows" ? WINDOWS_PERMISSIONS : MAC_PERMISSIONS;
}

const ENGINE_OPTIONS = [
  {
    id: "codex_local",
    title: "Managed cloud (recommended)",
    detail: "Recommended. Runs in Basics Cloud, with no API keys to set up.",
    badge: "No key required",
  },
  {
    id: "basics_managed",
    title: "Basics managed credits",
    detail: "Use workspace managed credits for cloud runs when reliability matters.",
    badge: "Cloud ready",
  },
  {
    id: "byok",
    title: "Bring your own key",
    detail: "Connect a provider key later for teams that want direct billing control.",
    badge: "Optional",
  },
] as const;

const SAFETY_DEFAULTS = [
  {
    id: "appInstallApproval",
    title: "Workspace apps require admin approval",
    detail: "New private apps and permission-changing updates enter review before rollout.",
  },
  {
    id: "firstAutomationRunApproval",
    title: "First automation run requires approval",
    detail: "Mutating or sensitive actions show what will happen before they run live.",
  },
  {
    id: "cloudDeployApproval",
    title: "Cloud deploys require approval",
    detail: "Promoting apps or automations to background/cloud execution creates an approval.",
  },
] as const;

type StepId = (typeof STEP_DEFS)[number]["id"];
type PermissionId = (typeof PERMISSION_IDS)[number];
type EngineMode = (typeof ENGINE_OPTIONS)[number]["id"];
type SafetyKey = (typeof SAFETY_DEFAULTS)[number]["id"];

type OnboardingState = {
  workspaceName: string;
  ownerName: string;
  ownerEmail: string;
  deviceId: string;
  deviceName: string;
  permissions: Record<PermissionId, OnboardingPermissionStatus>;
  captureEnabled: boolean;
  captureStatus: "running" | "paused";
  retentionDays: number;
  storageLocation: string;
  distilledCloudRequiresApproval: boolean;
  engineMode: EngineMode;
  policies: Record<SafetyKey, boolean>;
  dailyCloudBudgetUsd: number;
};

const STEP_INDEX_BY_ID: Record<StepId, number> = STEP_DEFS.reduce(
  (acc, step, index) => ({ ...acc, [step.id]: index }),
  {} as Record<StepId, number>,
);

const DEFAULT_STORAGE_LOCATION = "~/Library/Application Support/basichome/Lens";

function createInitialState(): OnboardingState {
  const permissions = Object.fromEntries(
    PERMISSION_IDS.map((id) => [id, "not_started"]),
  ) as Record<PermissionId, OnboardingPermissionStatus>;

  return {
    workspaceName: "Personal workspace",
    ownerName: "basichome local owner",
    ownerEmail: "local@basichome.dev",
    deviceId: createLocalId("device"),
    deviceName: "This Mac",
    permissions,
    captureEnabled: true,
    captureStatus: "running",
    retentionDays: 30,
    storageLocation: DEFAULT_STORAGE_LOCATION,
    distilledCloudRequiresApproval: true,
    engineMode: "codex_local",
    policies: {
      appInstallApproval: true,
      firstAutomationRunApproval: true,
      cloudDeployApproval: true,
    },
    dailyCloudBudgetUsd: 25,
  };
}

export function OnboardingFlow() {
  const { push } = useRouter();
  const [state, setState] = useState(createInitialState);
  const [stepIndex, setStepIndex] = useState(0);
  // Detect after mount to keep the server-rendered markup deterministic and
  // avoid a hydration mismatch. Defaults to the mac flow until resolved.
  const [os, setOs] = useState<ClientOS>("mac");
  const step = STEP_DEFS[stepIndex];

  useEffect(() => {
    setOs(detectClientOS());
  }, []);
  const nextStep = STEP_DEFS[stepIndex + 1];
  const progress = ((stepIndex + 1) / STEP_DEFS.length) * 100;

  const setField = <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const setPermissionStatus = (id: PermissionId, status: OnboardingPermissionStatus) => {
    setState((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [id]: status,
      },
    }));
  };

  const setPolicy = (id: SafetyKey, value: boolean) => {
    setState((current) => ({
      ...current,
      policies: {
        ...current.policies,
        [id]: value,
      },
    }));
  };

  const goNext = () => setStepIndex((current) => Math.min(current + 1, STEP_DEFS.length - 1));
  const goBack = () => setStepIndex((current) => Math.max(current - 1, 0));

  const finish = () => {
    const now = new Date().toISOString();
    const record: BasichomeOnboardingRecord = {
      schemaVersion: 1,
      completedAt: now,
      workspace: {
        id: createLocalId("workspace"),
        name: state.workspaceName,
        role: "owner",
        adminApprovalRequired: true,
      },
      device: {
        id: state.deviceId,
        name: state.deviceName,
        localProfileId: "local-dev-owner",
      },
      permissions: state.permissions,
      capture: {
        enabled: state.captureEnabled,
        status: state.captureStatus,
        retentionDays: state.retentionDays,
        storageLocation: state.storageLocation,
        rawCloudUpload: false,
        distilledCloudRequiresApproval: state.distilledCloudRequiresApproval,
      },
      engine: {
        mode: state.engineMode,
        apiKeyRequired: state.engineMode === "byok",
      },
      policy: {
        appInstallApproval: state.policies.appInstallApproval,
        firstAutomationRunApproval: state.policies.firstAutomationRunApproval,
        cloudDeployApproval: state.policies.cloudDeployApproval,
        trainingEnabled: false,
        dailyCloudBudgetUsd: state.dailyCloudBudgetUsd,
      },
    };
    const event = {
      id: createLocalId("evt"),
      event_type: "onboarding.completed",
      workspace_id: record.workspace.id,
      actor_account_id: "local-dev-owner",
      device_id: record.device.id,
      source: "client",
      privacy_class: "action_log",
      raw_context_uploaded: false,
      created_at: now,
    };

    window.localStorage.setItem(BASICHOME_ONBOARDING_STORAGE_KEY, JSON.stringify(record));
    window.localStorage.setItem(BASICHOME_ONBOARDING_EVENT_KEY, JSON.stringify(event));
    const next = new URLSearchParams(window.location.search).get("next");
    push(next?.startsWith("/") ? next : "/");
  };

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col px-4 py-4 md:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="font-semibold text-sm">b</span>
              </div>
              <span className="font-semibold text-lg tracking-tight">basichome setup</span>
            </div>
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
              Set up the local device, workspace owner role, Lens capture boundary, engine mode, and approval defaults before the cockpit opens.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Local first</Badge>
            <Badge variant="outline">Raw capture local</Badge>
            <Badge variant="outline">Owner/admin</Badge>
          </div>
        </header>

        <div className="grid flex-1 gap-6 py-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-4">
            <Progress value={progress} />
            <div className="space-y-2">
              {STEP_DEFS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStepIndex(STEP_INDEX_BY_ID[item.id])}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
                    index === stepIndex ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                      index < stepIndex
                        ? "border-primary bg-primary text-primary-foreground"
                        : index === stepIndex
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground",
                    )}
                  >
                    {index < stepIndex ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-sm">{item.title}</span>
                    <span className="block text-muted-foreground text-xs">{item.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-w-0">
            <Card className="min-h-[620px]">
              <CardHeader className="border-b">
                <CardTitle className="text-xl">{step.title}</CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
              <CardContent className="py-5">
                {step.id === "welcome" ? <WelcomeStep os={os} /> : null}
                {step.id === "workspace" ? <WorkspaceStep state={state} setField={setField} /> : null}
                {step.id === "permissions" ? (
                  <PermissionsStep os={os} permissions={state.permissions} setPermissionStatus={setPermissionStatus} />
                ) : null}
                {step.id === "capture" ? <CaptureStep state={state} setField={setField} /> : null}
                {step.id === "engine" ? <EngineStep state={state} setField={setField} /> : null}
                {step.id === "safety" ? <SafetyStep state={state} setPolicy={setPolicy} setField={setField} /> : null}
                {step.id === "review" ? <ReviewStep state={state} os={os} /> : null}
              </CardContent>
            </Card>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={goBack} disabled={stepIndex === 0}>
                Back
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  Step {stepIndex + 1} of {STEP_DEFS.length}
                </span>
                {step.id === "review" ? (
                  <Button type="button" onClick={finish}>
                    Finish setup
                  </Button>
                ) : (
                  <Button type="button" onClick={goNext}>
                    Continue to {nextStep.title}
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function WelcomeStep({ os }: { os: ClientOS }) {
  const chord = os === "windows" ? "Ctrl + Shift + Space" : "⌘ + Shift + Space";
  const areas: Array<{ icon: Icon; title: string; detail: string }> = [
    { icon: Home, title: "Home", detail: "Talk to your agent, see your agents, and your recent documents." },
    { icon: Folder, title: "Apps", detail: "Simple databases where your runs drop results, like a CRM or a digest. You and your agents can both read and write them." },
    { icon: FileCheck2, title: "Documents", detail: "Longer things your agents write, like reports, plans, and drafts, for you to review." },
    { icon: Globe, title: "Browser", detail: "Run browser tasks in the cloud or on your own Chrome, and sign in to sites once." },
    { icon: Play, title: "Runs", detail: "Watch the agent work live and take over any time." },
    { icon: ClipboardCheck, title: "Approvals", detail: "Risky actions pause here with a preview before they happen." },
    { icon: Plug, title: "Connections", detail: "Connect Gmail, Calendar, and more so agents can act for you." },
    { icon: Workflow, title: "Automations", detail: "Save a task as a reusable agent that runs on a schedule." },
  ];
  return (
    <div className="space-y-6">
      {/* The pill */}
      <div className="rounded-lg border bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Mic className="size-5" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h3 className="font-semibold">Talk to your agent from anywhere</h3>
            <p className="text-muted-foreground text-sm">
              Press{" "}
              <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs">{chord}</kbd>{" "}
              to summon the pill and tell the agent what to do, by voice or text, no matter what app you&apos;re in.
              While it works, the pill rides along showing progress; the main window is where you review.
              basichome is review-first, so chat stays minimal.
            </p>
          </div>
        </div>
      </div>

      {/* Where things live */}
      <div>
        <h3 className="mb-3 font-medium text-sm">Where things live</h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {areas.map((a) => (
            <div key={a.title} className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <a.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm">{a.title}</div>
                <p className="text-muted-foreground text-xs">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The loop */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="font-medium text-sm">The loop</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {["Ask (pill or Home)", "Agent works", "Outputs land in Apps & Documents", "You review & approve"].map(
            (s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-full border bg-card px-3 py-1 font-medium text-xs">{s}</span>
                {i < arr.length - 1 ? <span className="text-muted-foreground">→</span> : null}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceStep({
  state,
  setField,
}: {
  state: OnboardingState;
  setField: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Workspace name" value={state.workspaceName} onChange={(value) => setField("workspaceName", value)} />
          <TextField label="Device name" value={state.deviceName} onChange={(value) => setField("deviceName", value)} />
          <TextField label="Owner name" value={state.ownerName} onChange={(value) => setField("ownerName", value)} />
          <TextField label="Owner email" type="email" value={state.ownerEmail} onChange={(value) => setField("ownerEmail", value)} />
        </div>
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <UserCog className="mt-0.5 size-5 text-primary" />
            <div className="space-y-1">
              <h3 className="font-medium text-sm">You are the owner/admin for this workspace.</h3>
              <p className="text-muted-foreground text-sm">
                Solo mode still writes workspace, role, device, and approval policy state so teams can be added later without changing the data model.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <InfoPanel icon={ShieldCheck} title="Admin boundary" detail="Apps, cloud deploys, shared credentials, capture sync, training, and trust grants need explicit approval records." />
        <InfoPanel icon={Lock} title="Raw capture boundary" detail="Admins cannot see another user's raw local screenshots, OCR, audio, or input timeline in v1." />
      </div>
    </div>
  );
}

function PermissionsStep({
  os,
  permissions,
  setPermissionStatus,
}: {
  os: ClientOS;
  permissions: Record<PermissionId, OnboardingPermissionStatus>;
  setPermissionStatus: (id: PermissionId, status: OnboardingPermissionStatus) => void;
}) {
  const items = permissionsForOS(os);
  const isWindows = os === "windows";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <h3 className="font-medium text-sm">No hidden capture behavior</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          {isWindows
            ? "Windows grants screen and input capture the first time each is needed, so there is no separate pre-grant step. We will ask only when a feature first requires it, and your raw screen, input, and audio data stays on this device."
            : "These controls model the native macOS permission sequence. In the desktop app, each item opens the matching OS prompt; in this web shell, status is recorded locally for the setup flow."}
        </p>
      </div>
      <div className="grid gap-3">
        {items.map((permission) => {
          const status = permissions[permission.id];
          return (
            <div key={permission.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <permission.icon className="size-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-sm">{permission.title}</h3>
                      <PermissionBadge status={status} />
                    </div>
                    <p className="text-muted-foreground text-sm">{permission.detail}</p>
                    <p className="text-muted-foreground text-xs">{permission.why}</p>
                    {status === "skipped" ? (
                      <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-900 text-xs dark:bg-amber-950/40 dark:text-amber-200">
                        {isWindows
                          ? "Skipped for now. Windows will still prompt for this when a feature first needs it, and you can review it in settings."
                          : "Skipped for now. basichome will keep setup recoverable and show where to grant this later."}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {status === "skipped" ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setPermissionStatus(permission.id, "not_started")}>
                      Reset {permission.title}
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => setPermissionStatus(permission.id, "skipped")}>
                      Skip {permission.title}
                    </Button>
                  )}
                  <Button type="button" size="sm" onClick={() => setPermissionStatus(permission.id, "granted")}>
                    {isWindows ? `Allow ${permission.title} when asked` : `Mark ${permission.title} granted`}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CaptureStep({
  state,
  setField,
}: {
  state: OnboardingState;
  setField: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-medium text-sm">Lens local capture</h3>
              <p className="text-muted-foreground text-sm">
                24/7 capture starts locally after permissions are granted. You can pause immediately and raw data stays on this device.
              </p>
            </div>
            <Switch checked={state.captureEnabled} onCheckedChange={(checked) => setField("captureEnabled", checked)} aria-label="Enable local capture" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant={state.captureStatus === "running" ? "secondary" : "default"}
              size="sm"
              onClick={() => setField("captureStatus", state.captureStatus === "running" ? "paused" : "running")}
              disabled={!state.captureEnabled}
            >
              {state.captureStatus === "running" ? "Pause capture" : "Resume capture"}
            </Button>
            <Badge variant={state.captureEnabled && state.captureStatus === "running" ? "default" : "secondary"}>
              {state.captureEnabled ? state.captureStatus : "off"}
            </Badge>
            <Badge variant="outline">raw_local</Badge>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label htmlFor="onboarding-retention" className="space-y-2">
            <span className="text-sm font-medium">Retention</span>
            <NativeSelect
              id="onboarding-retention"
              className="w-full"
              value={state.retentionDays.toString()}
              onChange={(event) => setField("retentionDays", Number(event.target.value))}
            >
              <NativeSelectOption value="7">7 days</NativeSelectOption>
              <NativeSelectOption value="30">30 days</NativeSelectOption>
              <NativeSelectOption value="90">90 days</NativeSelectOption>
            </NativeSelect>
          </label>
          <TextField label="Local storage location" value={state.storageLocation} onChange={(value) => setField("storageLocation", value)} />
        </div>

        <div className="grid gap-3">
          <ToggleRow
            icon={Brain}
            title="Distilled summaries require approval"
            detail="Summaries may later feed workspace memory only after review. Raw frames never upload."
            checked={state.distilledCloudRequiresApproval}
            onCheckedChange={(checked) => setField("distilledCloudRequiresApproval", checked)}
          />
          <ToggleRow
            icon={Lock}
            title="Training data disabled"
            detail="Training and eval data capture is off for v1 setup and can be opted into later from settings."
            checked={false}
            disabled
            onCheckedChange={() => undefined}
          />
        </div>
      </div>

      <div className="space-y-3">
        <InfoPanel icon={Eye} title="What can be captured" detail="Accessibility text, OCR fallback, app/window focus, browser title/URL, input metadata, and optional audio." />
        <InfoPanel icon={Lock} title="What leaves the device" detail="Nothing raw. Only approved distilled summaries or explicit user-provided inputs can cross to cloud later." />
        <InfoPanel icon={ClipboardCheck} title="User controls" detail="Pause, resume, retention, delete/export, and redaction controls stay visible in the product." />
      </div>
    </div>
  );
}

function EngineStep({
  state,
  setField,
}: {
  state: OnboardingState;
  setField: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <RadioGroup value={state.engineMode} onValueChange={(value) => setField("engineMode", value as EngineMode)} className="grid gap-3">
        {ENGINE_OPTIONS.map((option) => (
          <label
            key={option.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors",
              state.engineMode === option.id ? "border-primary/50 bg-primary/5" : "bg-card hover:bg-muted/50",
            )}
          >
            <RadioGroupItem value={option.id} className="mt-1" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">{option.title}</span>
                <Badge variant="outline">{option.badge}</Badge>
              </span>
              <span className="mt-1 block text-muted-foreground text-sm">{option.detail}</span>
            </span>
          </label>
        ))}
      </RadioGroup>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-5 text-primary" />
          <div className="space-y-1">
            <h3 className="font-medium text-sm">No API key needed to start</h3>
            <p className="text-muted-foreground text-sm">
              The recommended mode runs in Basics Cloud with credits included, so there are no API keys to set up. You can add your own key later in team settings if you want.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyStep({
  state,
  setPolicy,
  setField,
}: {
  state: OnboardingState;
  setPolicy: (id: SafetyKey, value: boolean) => void;
  setField: <K extends keyof OnboardingState>(key: K, value: OnboardingState[K]) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {SAFETY_DEFAULTS.map((policy) => (
          <ToggleRow
            key={policy.id}
            icon={ShieldCheck}
            title={policy.title}
            detail={policy.detail}
            checked={state.policies[policy.id]}
            onCheckedChange={(checked) => setPolicy(policy.id, checked)}
          />
        ))}
        <div className="rounded-lg border bg-card p-4">
          <Label htmlFor="daily-budget">Daily cloud budget cap</Label>
          <div className="mt-2 flex max-w-xs items-center gap-2">
            <span className="text-muted-foreground text-sm">$</span>
            <Input
              id="daily-budget"
              inputMode="numeric"
              value={state.dailyCloudBudgetUsd.toString()}
              onChange={(event) => setField("dailyCloudBudgetUsd", Number(event.target.value) || 0)}
            />
          </div>
          <p className="mt-2 text-muted-foreground text-sm">
            Conservative cap for background/cloud runs until billing and workspace policy are fully wired.
          </p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 size-5 text-primary" />
          <div className="space-y-2">
            <h3 className="font-medium text-sm">First approval walkthrough</h3>
            <p className="text-muted-foreground text-sm">
              The first app publish, cloud promotion, browser credential, trusted autonomous grant, capture sync, or training setting will open an approval detail before the action completes.
            </p>
            <Separator />
            <ul className="space-y-2 text-sm">
              <li>Shows requested data, apps, tools, domains, target, and cost.</li>
              <li>Explains what stays local and what enters cloud.</li>
              <li>Creates an audit record with requester, approver, policy snapshot, and limits.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({ state, os }: { state: OnboardingState; os: ClientOS }) {
  const items = permissionsForOS(os);
  const grantedCount = items.filter((permission) => state.permissions[permission.id] === "granted").length;
  const skippedCount = items.filter((permission) => state.permissions[permission.id] === "skipped").length;
  const selectedEngine = ENGINE_OPTIONS.find((option) => option.id === state.engineMode);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ReviewPanel
        title="Workspace"
        rows={[
          ["Name", state.workspaceName],
          ["Role", "Owner/admin"],
          ["Device", `${state.deviceName} (${state.deviceId})`],
        ]}
      />
      <ReviewPanel
        title="Permissions"
        rows={[
          ["Granted", grantedCount.toString()],
          ["Skipped", skippedCount.toString()],
          ["Recovery", skippedCount > 0 ? "Shown in setup and settings" : "No skipped permissions"],
        ]}
      />
      <ReviewPanel
        title="Capture"
        rows={[
          ["Mode", state.captureEnabled ? state.captureStatus : "off"],
          ["Raw upload", "Off"],
          ["Retention", `${state.retentionDays} days`],
          ["Storage", state.storageLocation],
        ]}
      />
      <ReviewPanel
        title="Engine and policy"
        rows={[
          ["Engine", selectedEngine?.title ?? state.engineMode],
          ["API key required", state.engineMode === "byok" ? "Later" : "No"],
          ["First run approval", state.policies.firstAutomationRunApproval ? "On" : "Off"],
          ["Training", "Disabled"],
        ]}
      />
      <div className="rounded-lg border bg-primary/5 p-4 lg:col-span-2">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 text-primary" />
          <div className="space-y-1">
            <h3 className="font-medium text-sm">Ready for local-first basichome</h3>
            <p className="text-muted-foreground text-sm">
              Finishing writes local setup state only. No raw screenshots, OCR, audio, browser profile data, or input timeline is uploaded.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function PermissionBadge({ status }: { status: OnboardingPermissionStatus }) {
  if (status === "granted") {
    return <Badge>Granted</Badge>;
  }

  if (status === "skipped") {
    return <Badge variant="secondary">Skipped</Badge>;
  }

  return <Badge variant="outline">Not started</Badge>;
}

function ToggleRow({
  icon: IconComponent,
  title,
  detail,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: Icon;
  title: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
      <div className="flex min-w-0 gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <IconComponent className="size-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          <p className="text-muted-foreground text-sm">{detail}</p>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

function InfoPanel({ icon: IconComponent, title, detail }: { icon: Icon; title: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <IconComponent className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          <p className="text-muted-foreground text-sm">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-medium text-sm">{title}</h3>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}`;
}
