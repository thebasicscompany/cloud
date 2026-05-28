import type { LocalAgentRun } from "@/types/local-agent";
import type {
  CheckResult,
  Run,
  RunStatus,
  RunStep,
  RunTrigger,
  Workflow,
} from "@/types/runs";
import type {
  CloudAutomation,
  CloudAutomationOutput,
  CloudAutomationRun,
  CloudAutomationRunStatus,
  CloudAutomationStore,
  CloudAutomationSummary,
  CloudAutomationTrigger,
  CloudReplayFrame,
  CloudRunEvent,
  CloudRunEventType,
  CloudTrustGrant,
} from "@/types/cloud-automation";

export const BASICHOME_CLOUD_AUTOMATION_STORAGE_KEY = "basichome:cloud-automation-runtime:v1";

const DEFAULT_WORKSPACE_ID = "workspace_local";
const DEFAULT_ACTOR_ACCOUNT_ID = "local-dev-owner";
const DEFAULT_DEVICE_ID = "device_local_dev";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RUNS = 30;

export function createInitialCloudAutomationStore(): CloudAutomationStore {
  const now = Date.now();
  const eodAutomationId = "auto_eod_invoice_review";
  const leadAutomationId = "auto_new_lead_quote_sms";
  const eodGrant = createTrustGrant({
    id: "grant_eod_customer_billing_email",
    automationId: eodAutomationId,
    label: "Customer billing email",
    toolSlug: "GMAIL_SEND_EMAIL",
    scopeDescription: "Auto-approve Gmail sends only when the recipient is a customer billing address and the invoice amount is below 500 dollars.",
    status: "active",
    decidedVia: "desktop",
    createdAt: isoFrom(now, -22),
    constraints: { recipient_kind: "customer_billing", max_amount_usd: 500, from_alias: "sales@" },
  });
  const leadGrant = createTrustGrant({
    id: "grant_lead_owner_sms_quote",
    automationId: leadAutomationId,
    label: "Owner SMS quote draft",
    toolSlug: "SENDBLUE_SEND_SMS",
    scopeDescription: "Auto-approve SMS only for inbound quote requests where the text is generated from the submitted lead form.",
    status: "pending_review",
    decidedVia: "seeded",
    createdAt: isoFrom(now, -16),
    constraints: { source: "website_quote_request", require_customer_phone: true },
  });

  const automations: CloudAutomation[] = [
    {
      id: eodAutomationId,
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: "End-of-day invoicing and review chase",
      description: "A cloud automation that closes the day, drafts customer follow-ups, and writes a replayable audit trail while the owner is offline.",
      goal:
        "At 6 PM on weekdays, open JobBoard Pro, list completed jobs that are ready to bill, create QuickBooks invoices, send approved reminder emails through Gmail, and write a verified summary for the owner.",
      source: "seeded_cloud",
      status: "active",
      version: 4,
      triggers: [
        {
          id: "trig_eod_manual",
          type: "manual",
          status: "registered",
        },
        {
          id: "trig_eod_weekday_6pm",
          type: "schedule",
          cron: "0 18 * * 1-5",
          timezone: "America/New_York",
          nextRunAt: isoFrom(now, 45),
          status: "registered",
          eventBridgeName: "automation-auto_eod_invoice_review-1",
        },
      ],
      outputs: [
        { channel: "desktop", target: "Owner dashboard", when: "on_complete" },
        { channel: "sms", target: "+1-412-555-0186", when: "on_failure" },
      ],
      requiredCredentials: ["jobboardpro", "quickbooks", "gmail", "browserbase"],
      checkModules: ["quickbooks-invoices-created", "emails-sent", "replay-jsonl-written"],
      approvalPolicy: {
        mode: "trusted_autonomous",
        requireForTools: ["GMAIL_SEND_EMAIL", "QUICKBOOKS_CREATE_INVOICE"],
        trustGrantIds: [eodGrant.id],
        firstRunReviewRequired: false,
      },
      trustGrants: [eodGrant],
      createdAt: isoFrom(now, -9_800),
      updatedAt: isoFrom(now, -22),
      lastRunId: "run_cloud_eod_seed_success",
      costLimitCents: 250,
    },
    {
      id: leadAutomationId,
      workspaceId: DEFAULT_WORKSPACE_ID,
      name: "New lead quote text",
      description: "A webhook automation that reacts to a website quote form, gathers local context, drafts a text quote, and waits for trust before it sends.",
      goal:
        "When a quote request arrives from the website, inspect the lead, look up comparable jobs, draft a personalized SMS quote, and send after the approval policy allows it.",
      source: "seeded_cloud",
      status: "active",
      version: 2,
      triggers: [
        {
          id: "trig_lead_webhook",
          type: "composio_webhook",
          toolkit: "webhook",
          event: "QUOTE_FORM_SUBMITTED",
          filters: { source: "basichome-form" },
          status: "registered",
          triggerRef: "composio_trigger_quote_form_submitted",
        },
        {
          id: "trig_lead_manual",
          type: "manual",
          status: "registered",
        },
      ],
      outputs: [
        { channel: "desktop", target: "Owner dashboard", when: "on_complete" },
        { channel: "email", target: "ops@example.com", when: "on_failure" },
      ],
      requiredCredentials: ["sendblue", "jobboardpro", "browserbase"],
      checkModules: ["lead-context-read", "sms-preview-created"],
      approvalPolicy: {
        mode: "risk_based",
        requireForTools: ["SENDBLUE_SEND_SMS"],
        trustGrantIds: [leadGrant.id],
        firstRunReviewRequired: true,
      },
      trustGrants: [leadGrant],
      createdAt: isoFrom(now, -7_400),
      updatedAt: isoFrom(now, -16),
      lastRunId: "run_cloud_lead_seed_failed",
      costLimitCents: 175,
    },
  ];

  const successfulRun = createSeedCloudRun({
    runId: "run_cloud_eod_seed_success",
    automation: automations[0]!,
    status: "completed",
    trigger: "scheduled",
    startedAt: isoFrom(now, -38),
    completedAt: isoFrom(now, -37),
    resultSummary: "Created 2 invoices, sent 2 customer billing emails using the remembered trust grant, and wrote replay JSONL.",
  });
  const failedRun = createSeedCloudRun({
    runId: "run_cloud_lead_seed_failed",
    automation: automations[1]!,
    status: "failed",
    trigger: "webhook",
    startedAt: isoFrom(now, -1_470),
    completedAt: isoFrom(now, -1_468),
    resultSummary: "Replay captured a blocked Sendblue send because the SMS trust grant is still pending review.",
    errorSummary: "Approval policy paused the mutating SMS send. No trust grant matched SENDBLUE_SEND_SMS.",
  });

  const runs = [successfulRun, failedRun];
  return {
    schemaVersion: 1,
    automations,
    runs,
    logs: runs.flatMap((run) => run.events).sort(sortEventsDesc),
    activeRunId: successfulRun.id,
  };
}

export function readCloudAutomationStore(): CloudAutomationStore {
  if (typeof window === "undefined") {
    return createInitialCloudAutomationStore();
  }

  const stored = window.localStorage.getItem(BASICHOME_CLOUD_AUTOMATION_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<CloudAutomationStore>;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.automations) && Array.isArray(parsed.runs)) {
        return withSeedDefaults({
          schemaVersion: 1,
          automations: parsed.automations as CloudAutomation[],
          runs: parsed.runs as CloudAutomationRun[],
          logs: Array.isArray(parsed.logs) ? (parsed.logs as CloudRunEvent[]) : [],
          activeRunId: parsed.activeRunId,
          lastPromotedAutomationId: parsed.lastPromotedAutomationId,
        });
      }
    } catch {
      window.localStorage.removeItem(BASICHOME_CLOUD_AUTOMATION_STORAGE_KEY);
    }
  }

  const seeded = createInitialCloudAutomationStore();
  writeCloudAutomationStore(seeded);
  return seeded;
}

function withSeedDefaults(store: CloudAutomationStore): CloudAutomationStore {
  const seeded = createInitialCloudAutomationStore();
  const automationIds = new Set(store.automations.map((automation) => automation.id));
  const runIds = new Set(store.runs.map((run) => run.id));
  const missingAutomations = seeded.automations.filter((automation) => !automationIds.has(automation.id));
  const missingRuns = seeded.runs.filter((run) => !runIds.has(run.id));
  if (missingAutomations.length === 0 && missingRuns.length === 0 && store.logs.length > 0) return store;
  const merged: CloudAutomationStore = {
    ...store,
    automations: [...store.automations, ...missingAutomations],
    runs: [...store.runs, ...missingRuns],
    logs: [...store.logs, ...missingRuns.flatMap((run) => run.events)].sort(sortEventsDesc),
    activeRunId: store.activeRunId ?? seeded.activeRunId,
  };
  if (typeof window !== "undefined") {
    writeCloudAutomationStore(merged);
  }
  return merged;
}

export function writeCloudAutomationStore(store: CloudAutomationStore): CloudAutomationStore {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASICHOME_CLOUD_AUTOMATION_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function listCloudAutomationSummaries(store: CloudAutomationStore): CloudAutomationSummary[] {
  return store.automations
    .filter((automation) => automation.status !== "archived")
    .map((automation) => summarizeCloudAutomation(automation, store.runs))
    .sort((a, b) => (b.lastRun?.startedAt ?? b.updatedAt).localeCompare(a.lastRun?.startedAt ?? a.updatedAt));
}

export function findCloudAutomation(store: CloudAutomationStore, id: string): CloudAutomation | undefined {
  return store.automations.find((automation) => automation.id === id);
}

export function findCloudAutomationRun(store: CloudAutomationStore, runId: string): CloudAutomationRun | undefined {
  return store.runs.find((run) => run.id === runId);
}

export function listCloudAutomationRunsFor(store: CloudAutomationStore, automationId: string): CloudAutomationRun[] {
  return store.runs
    .filter((run) => run.automationId === automationId)
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function listCloudAutomationLogs(store: CloudAutomationStore): CloudRunEvent[] {
  const runEvents = store.runs.flatMap((run) => run.events);
  const byId = new Map<string, CloudRunEvent>();
  for (const event of [...store.logs, ...runEvents]) byId.set(event.id, event);
  return Array.from(byId.values()).sort(sortEventsDesc);
}

export function promoteLocalRunToCloudAutomation(
  store: CloudAutomationStore,
  localRun?: LocalAgentRun,
): CloudAutomationStore {
  const now = new Date().toISOString();
  const sourceRunId = localRun?.runId ?? "run_local_sample";
  const existing = store.automations.find((automation) => automation.localSourceRunId === sourceRunId);
  const automationId = existing?.id ?? `auto_promoted_${sourceRunId.replace(/[^a-zA-Z0-9]/g, "_").slice(-18)}`;
  const domain = localRun?.browser?.domain ?? "jobboardpro.example";
  const automationName = localRun?.taskTitle ? `Cloud: ${localRun.taskTitle}` : "Cloud: overnight browser follow-up";
  const pendingGrant = createTrustGrant({
    id: `grant_${automationId}_billing_send`,
    automationId,
    label: "Promoted workflow send action",
    toolSlug: domain.includes("jobboard") ? "GMAIL_SEND_EMAIL" : "BROWSER_MUTATION",
    scopeDescription: "Auto-approve only the repeated action captured from this local workflow after the user grants trust.",
    status: "pending_review",
    decidedVia: "desktop",
    createdAt: now,
    constraints: { source_run_id: sourceRunId, domain, max_replay_age_days: 30 },
  });
  const nextRunAt = isoFrom(Date.now(), 90);
  const automation: CloudAutomation = {
    id: automationId,
    workspaceId: localRun?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    name: automationName,
    description: "Promoted from a local basichome run so it can be scheduled, replayed, logged, and moved to a cloud worker when the device is offline.",
    goal:
      localRun?.prompt ??
      "Run the browser workflow overnight, use the saved local profile after approval, and report every mutating step with replay JSONL.",
    source: "local_promotion",
    status: "active",
    version: existing ? existing.version + 1 : 1,
    triggers: [
      { id: `trig_${automationId}_manual`, type: "manual", status: "registered" },
      {
        id: `trig_${automationId}_schedule`,
        type: "schedule",
        cron: "0 18 * * 1-5",
        timezone: "America/New_York",
        nextRunAt,
        status: "registered",
        eventBridgeName: `automation-${automationId}-1`,
      },
    ],
    outputs: [
      { channel: "desktop", target: "basichome dashboard", when: "on_complete" },
      { channel: "desktop", target: "basichome dashboard", when: "on_failure" },
    ],
    requiredCredentials: credentialsForDomain(domain),
    checkModules: ["worker-run-finished", "replay-jsonl-written", "outputs-delivered"],
    approvalPolicy: {
      mode: "risk_based",
      requireForTools: [pendingGrant.toolSlug],
      trustGrantIds: [pendingGrant.id],
      firstRunReviewRequired: true,
    },
    trustGrants: [pendingGrant],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    localSourceRunId: sourceRunId,
    costLimitCents: 200,
  };
  const log = createAutomationLog({
    automation,
    type: "automation.promoted_from_local",
    message: "Local workflow promoted to a saved Basics Cloud automation with a schedule, trust policy, and replay contract.",
    createdAt: now,
    source: "client",
    payload: {
      source_run_id: sourceRunId,
      api_surface: "POST /v1/automations + POST /v1/automations/:id/activate",
      events_url: `/v1/runs/<run_id>/events`,
      schedule: "EventBridge Scheduler -> SQS -> Fargate worker",
      domain,
    },
  });

  return writeStoreWithLog({
    ...store,
    automations: [automation, ...store.automations.filter((item) => item.id !== automationId)],
    lastPromotedAutomationId: automationId,
  }, log);
}

export function runCloudAutomationNow(
  store: CloudAutomationStore,
  automationId: string,
  trigger: CloudAutomationRun["trigger"] = "manual",
): CloudAutomationStore {
  const automation = findCloudAutomation(store, automationId);
  if (!automation) return store;
  const now = Date.now();
  const runId = createId("run_cloud");
  const activeGrantCount = automation.trustGrants.filter((grant) => grant.status === "active").length;
  const autonomous = automation.approvalPolicy.mode === "trusted_autonomous" && activeGrantCount > 0;
  const status: CloudAutomationRunStatus = autonomous ? "completed" : "awaiting_approval";
  const startedAt = isoFrom(now, 0);
  const completedAt = autonomous ? isoFrom(now, 1) : undefined;
  const browserbaseSessionId = `bb_${runId.slice(-12)}`;
  const liveViewUrl = `https://cloud.trybasics.ai/live/${runId}`;
  const events = createRunEvents({
    automation,
    runId,
    startedAt,
    completedAt,
    status,
    trigger,
    browserbaseSessionId,
    autonomous,
  });
  const outputs = autonomous ? createSuccessfulOutputs(automation, runId, isoFrom(now, 1)) : [];
  const replayFrames = events.map((event) => createReplayFrame(runId, event));
  const run: CloudAutomationRun = {
    id: runId,
    automationId,
    automationName: automation.name,
    workspaceId: automation.workspaceId,
    actorAccountId: DEFAULT_ACTOR_ACCOUNT_ID,
    deviceId: DEFAULT_DEVICE_ID,
    status,
    trigger,
    runMode: "live",
    startedAt,
    completedAt,
    resultSummary: autonomous
      ? "Cloud worker completed the automation autonomously and wrote replay JSONL."
      : "Run is paused on its first mutating action until a trust grant is approved.",
    errorSummary: autonomous ? undefined : "Approval required before sending or writing externally.",
    cloudAgentId: `cloud_agent_${automationId}`,
    worker: {
      poolId: `pool_${automationId.slice(-8)}`,
      queue: "basics-runs.fifo",
      fargateTaskArn: `arn:aws:ecs:us-east-1:basics:task/${runId}`,
      browserbaseSessionId,
      liveViewUrl,
      eventsUrl: `/v1/runs/${runId}/events`,
      replayJsonlUrl: `s3://basics-replay/${automation.workspaceId}/${runId}.jsonl`,
    },
    usage: {
      apiCreditsCents: autonomous ? 18 : 6,
      modelTokens: autonomous ? 11_240 : 4_120,
      browserMinutes: autonomous ? 1.2 : 0.4,
      toolCalls: autonomous ? 9 : 4,
      workerSeconds: autonomous ? 52 : 18,
    },
    outputs,
    events,
    replayFrames,
  };

  const updatedAutomation: CloudAutomation = {
    ...automation,
    lastRunId: runId,
    updatedAt: startedAt,
    trustGrants: automation.trustGrants.map((grant) =>
      grant.status === "active" ? { ...grant, lastUsedAt: startedAt, updatedAt: startedAt } : grant,
    ),
  };

  return limitRuns({
    ...store,
    activeRunId: runId,
    automations: store.automations.map((item) => (item.id === automationId ? updatedAutomation : item)),
    runs: [run, ...store.runs],
    logs: [...events, ...store.logs].sort(sortEventsDesc),
  });
}

export function updateCloudAutomationSchedule(
  store: CloudAutomationStore,
  automationId: string,
  cron: string,
  timezone: string,
): CloudAutomationStore {
  const automation = findCloudAutomation(store, automationId);
  if (!automation) return store;
  const now = new Date().toISOString();
  const nextRunAt = isoFrom(Date.now(), 120);
  const schedule: CloudAutomationTrigger = {
    id: `trig_${automationId}_schedule`,
    type: "schedule",
    cron,
    timezone,
    nextRunAt,
    status: "registered",
    eventBridgeName: `automation-${automationId}-1`,
  };
  const manual = automation.triggers.find((trigger) => trigger.type === "manual") ?? { id: `trig_${automationId}_manual`, type: "manual" as const, status: "registered" as const };
  const updated: CloudAutomation = {
    ...automation,
    triggers: [manual, schedule, ...automation.triggers.filter((trigger) => trigger.type !== "manual" && trigger.type !== "schedule")],
    status: automation.status === "draft" ? "active" : automation.status,
    updatedAt: now,
  };
  return writeStoreWithLog({
    ...store,
    automations: store.automations.map((item) => (item.id === automationId ? updated : item)),
  }, createAutomationLog({
    automation: updated,
    type: "automation.schedule_updated",
    message: "Schedule updated and trigger registry reconciled.",
    createdAt: now,
    source: "client",
    payload: { cron, timezone, eventbridge_name: schedule.eventBridgeName, api_surface: "PUT /v1/automations/:id" },
  }));
}

export function pauseCloudAutomation(store: CloudAutomationStore, automationId: string): CloudAutomationStore {
  return setCloudAutomationStatus(store, automationId, "paused", "automation.paused", "Automation paused. Registered triggers are disabled but logs and replay stay available.");
}

export function resumeCloudAutomation(store: CloudAutomationStore, automationId: string): CloudAutomationStore {
  return setCloudAutomationStatus(store, automationId, "active", "automation.resumed", "Automation resumed. Schedule and webhook triggers can dispatch again.");
}

export function grantCloudAutomationTrust(store: CloudAutomationStore, automationId: string): CloudAutomationStore {
  const automation = findCloudAutomation(store, automationId);
  if (!automation) return store;
  const now = new Date().toISOString();
  const grants = automation.trustGrants.length > 0
    ? automation.trustGrants.map((grant) => ({ ...grant, status: "active" as const, updatedAt: now, decidedVia: "desktop" as const }))
    : [
        createTrustGrant({
          id: `grant_${automationId}_default`,
          automationId,
          label: "Default trusted action",
          toolSlug: automation.approvalPolicy.requireForTools[0] ?? "BROWSER_MUTATION",
          scopeDescription: "Auto-approve the repeated action for this automation only.",
          status: "active",
          decidedVia: "desktop",
          createdAt: now,
          constraints: { automation_id: automationId },
        }),
      ];
  const updated: CloudAutomation = {
    ...automation,
    trustGrants: grants,
    approvalPolicy: {
      ...automation.approvalPolicy,
      mode: "trusted_autonomous",
      firstRunReviewRequired: false,
      trustGrantIds: grants.map((grant) => grant.id),
    },
    updatedAt: now,
  };
  return writeStoreWithLog({
    ...store,
    automations: store.automations.map((item) => (item.id === automationId ? updated : item)),
  }, createAutomationLog({
    automation: updated,
    type: "trust_grant.applied",
    message: "Trust grant applied from desktop. Matching tool calls can run autonomously with replay logs.",
    createdAt: now,
    source: "approval",
    payload: { remember: true, approval_rules: grants.map((grant) => grant.id), api_surface: "POST /v1/approvals/:id?remember=true" },
  }));
}

export function revokeCloudAutomationTrust(store: CloudAutomationStore, automationId: string): CloudAutomationStore {
  const automation = findCloudAutomation(store, automationId);
  if (!automation) return store;
  const now = new Date().toISOString();
  const grants = automation.trustGrants.map((grant) => ({ ...grant, status: "revoked" as const, updatedAt: now }));
  const updated: CloudAutomation = {
    ...automation,
    trustGrants: grants,
    approvalPolicy: {
      ...automation.approvalPolicy,
      mode: "manual_review",
      firstRunReviewRequired: true,
    },
    updatedAt: now,
  };
  return writeStoreWithLog({
    ...store,
    automations: store.automations.map((item) => (item.id === automationId ? updated : item)),
  }, createAutomationLog({
    automation: updated,
    type: "trust_grant.revoked",
    message: "Trust grant revoked. Future mutating cloud tool calls must pause for approval.",
    createdAt: now,
    source: "approval",
    payload: { approval_rules: grants.map((grant) => grant.id), api_surface: "approval_rules revoke" },
  }));
}

export function replayCloudAutomationRun(store: CloudAutomationStore, runId: string): CloudAutomationStore {
  const sourceRun = findCloudAutomationRun(store, runId);
  if (!sourceRun) return store;
  const automation = findCloudAutomation(store, sourceRun.automationId);
  if (!automation) return store;
  const now = Date.now();
  const replayRunId = createId("run_cloud_replay");
  const startedAt = isoFrom(now, 0);
  const completedAt = isoFrom(now, 1);
  const replayEvent = createRunEvent({
    automation,
    runId: replayRunId,
    type: "replay_started",
    message: `Replay started from ${sourceRun.id}.`,
    createdAt: startedAt,
    source: "client",
    payload: {
      source_run_id: sourceRun.id,
      replay_jsonl_url: sourceRun.worker.replayJsonlUrl,
      failed_event_count: sourceRun.events.filter((event) => event.type === "run_failed" || event.type === "approval_requested").length,
    },
  });
  const completeEvent = createRunEvent({
    automation,
    runId: replayRunId,
    type: "run_completed",
    message: "Replay completed from stored JSONL. No external tools fired.",
    createdAt: completedAt,
    source: "worker",
    payload: { replay_only: true, source_run_id: sourceRun.id },
  });
  const events = [replayEvent, ...sourceRun.replayFrames.map((frame) => replayFrameToEvent(automation, replayRunId, frame)), completeEvent];
  const run: CloudAutomationRun = {
    ...sourceRun,
    id: replayRunId,
    status: "completed",
    trigger: "replay",
    runMode: "replay",
    startedAt,
    completedAt,
    resultSummary: `Replayed ${sourceRun.replayFrames.length} frames from ${sourceRun.id} without firing external tools.`,
    errorSummary: undefined,
    worker: {
      ...sourceRun.worker,
      liveViewUrl: `https://cloud.trybasics.ai/live/${replayRunId}`,
      eventsUrl: `/v1/runs/${replayRunId}/events`,
      replayJsonlUrl: `s3://basics-replay/${automation.workspaceId}/${replayRunId}.jsonl`,
    },
    outputs: [
      {
        id: `out_${replayRunId}`,
        runId: replayRunId,
        automationId: automation.id,
        kind: "log",
        summary: "Replay JSONL loaded for inspection.",
        target: "basichome logs",
        createdAt: completedAt,
      },
    ],
    events,
    replayFrames: events.map((event) => createReplayFrame(replayRunId, event)),
    usage: { apiCreditsCents: 0, modelTokens: 0, browserMinutes: 0, toolCalls: 0, workerSeconds: 2 },
  };
  return limitRuns({
    ...store,
    activeRunId: replayRunId,
    runs: [run, ...store.runs],
    logs: [...events, ...store.logs].sort(sortEventsDesc),
  });
}

export function cloudAutomationToWorkflow(automation: CloudAutomation): Workflow {
  const schedule = automation.triggers.find((trigger): trigger is Extract<CloudAutomationTrigger, { type: "schedule" }> => trigger.type === "schedule");
  return {
    id: automation.id,
    workspaceId: automation.workspaceId,
    name: automation.name,
    prompt: automation.goal,
    schedule: schedule?.cron,
    enabled: automation.status === "active",
    requiredCredentials: automation.requiredCredentials,
    checkModules: automation.checkModules,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
  };
}

export function cloudAutomationRunToRun(run: CloudAutomationRun): Run {
  return {
    id: run.id,
    workflowId: run.automationId,
    workflowName: run.automationName,
    workspaceId: run.workspaceId,
    status: cloudStatusToRunStatus(run.status),
    trigger: cloudTriggerToRunTrigger(run.trigger),
    triggeredBy: { id: run.actorAccountId, name: "basichome cloud worker" },
    browserbaseSessionId: run.worker.browserbaseSessionId,
    liveUrl: run.worker.liveViewUrl,
    takeoverActive: run.status === "paused_by_user",
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    costCents: run.usage.apiCreditsCents,
    stepCount: run.events.length,
    errorSummary: run.errorSummary,
    runtime: "basics_cloud_worker",
    executionTarget: "basics_cloud",
    actorAccountId: run.actorAccountId,
    deviceId: run.deviceId,
    authMode: "workspace_managed_credits",
    costBearer: "workspace_credits",
    activeTool: latestToolName(run),
    browserRuntimeTarget: "basics_cloud_browser",
    browserUrl: "https://cloud.trybasics.ai/worker/browser",
    browserTitle: run.status === "completed" ? "Completed cloud browser state" : "Live Basics Cloud Browser",
    browserDomain: "cloud.trybasics.ai",
  };
}

export function cloudAutomationRunToSteps(run: CloudAutomationRun): RunStep[] {
  return run.events
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((event, index): RunStep => {
      if (event.type === "tool_call_start" || event.type === "tool_call_end" || event.type === "screenshot" || event.type === "run_failed") {
        return {
          id: event.id,
          runId: run.id,
          stepIndex: index + 1,
          kind: "tool_call",
          payload: {
            kind: "tool_call",
            toolName: toolNameFromEvent(event),
            params: event.payload ?? {},
            result: event.type === "tool_call_end" || event.type === "screenshot" ? event.payload : undefined,
            error: event.type === "run_failed" ? run.errorSummary ?? event.message : undefined,
            durationMs: typeof event.payload?.duration_ms === "number" ? event.payload.duration_ms : 1,
            screenshotKey: typeof event.payload?.s3_key === "string" ? event.payload.s3_key : undefined,
          },
          createdAt: event.createdAt,
        };
      }

      if (event.type === "approval_requested" || event.type === "approval_auto_approved") {
        return {
          id: event.id,
          runId: run.id,
          stepIndex: index + 1,
          kind: "approval",
          payload: {
            kind: "approval",
            approvalId: String(event.payload?.approval_id ?? event.id),
            action: String(event.payload?.tool_slug ?? "cloud_action"),
            status: event.type === "approval_auto_approved" ? "approved" : "pending",
          },
          createdAt: event.createdAt,
        };
      }

      if (event.type === "verification_passed") {
        return {
          id: event.id,
          runId: run.id,
          stepIndex: index + 1,
          kind: "check",
          payload: {
            kind: "check",
            checkName: String(event.payload?.check_name ?? "cloud-verification"),
            passed: true,
            evidence: event.payload ?? {},
          },
          createdAt: event.createdAt,
        };
      }

      return {
        id: event.id,
        runId: run.id,
        stepIndex: index + 1,
        kind: "model_tool_use",
        payload: {
          kind: "model_tool_use",
          toolName: event.type.replaceAll(".", "_"),
          reasoning: event.message,
        },
        createdAt: event.createdAt,
      };
    });
}

export function cloudAutomationRunChecks(run: CloudAutomationRun): CheckResult[] {
  if (run.status === "failed") {
    return [
      {
        name: "approval-policy",
        passed: false,
        message: run.errorSummary ?? "Cloud worker stopped before completion.",
        evidence: { replay_jsonl_url: run.worker.replayJsonlUrl },
      },
    ];
  }
  if (run.status !== "completed") return [];
  return [
    {
      name: "outputs-delivered",
      passed: run.outputs.length > 0 || run.runMode === "replay",
      message: run.outputs.length > 0 ? `${run.outputs.length} output event${run.outputs.length === 1 ? "" : "s"} recorded.` : "Replay run did not fire external outputs.",
      evidence: { outputs: run.outputs.map((output) => output.kind) },
    },
    {
      name: "replay-jsonl-written",
      passed: run.replayFrames.length > 0,
      message: `${run.replayFrames.length} replay frames available.`,
      evidence: { replay_jsonl_url: run.worker.replayJsonlUrl },
    },
    {
      name: "cost-limit",
      passed: run.usage.apiCreditsCents <= 250,
      message: `${run.usage.apiCreditsCents} credits cents consumed.`,
      evidence: { worker_seconds: run.usage.workerSeconds, browser_minutes: run.usage.browserMinutes },
    },
  ];
}

export function cloudStatusToRunStatus(status: CloudAutomationRunStatus): RunStatus {
  if (status === "awaiting_approval") return "paused";
  if (status === "cancelled") return "stopped";
  if (status === "completed") return "verified";
  return status;
}

function summarizeCloudAutomation(automation: CloudAutomation, runs: CloudAutomationRun[]): CloudAutomationSummary {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const automationRuns = runs.filter((run) => run.automationId === automation.id);
  const recent = automationRuns.filter((run) => new Date(run.startedAt).getTime() >= cutoff);
  const completed = recent.filter((run) => run.status === "completed" || run.status === "failed" || run.status === "cancelled");
  const successful = completed.filter((run) => run.status === "completed");
  const lastRun = automationRuns.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const schedule = automation.triggers.find((trigger): trigger is Extract<CloudAutomationTrigger, { type: "schedule" }> => trigger.type === "schedule");
  return {
    ...automation,
    runsLast7d: recent.length,
    successRate: completed.length === 0 ? null : successful.length / completed.length,
    lastRun: lastRun ? { id: lastRun.id, status: cloudStatusToRunStatus(lastRun.status), startedAt: lastRun.startedAt } : undefined,
    nextRunAt: schedule?.nextRunAt,
    activeTrustGrantCount: automation.trustGrants.filter((grant) => grant.status === "active").length,
    monthlySpendCents: automationRuns.reduce((total, run) => total + run.usage.apiCreditsCents, 0),
  };
}

function setCloudAutomationStatus(
  store: CloudAutomationStore,
  automationId: string,
  status: CloudAutomation["status"],
  eventType: CloudRunEventType,
  message: string,
): CloudAutomationStore {
  const automation = findCloudAutomation(store, automationId);
  if (!automation) return store;
  const now = new Date().toISOString();
  const updated: CloudAutomation = {
    ...automation,
    status,
    triggers: automation.triggers.map((trigger) =>
      trigger.type === "manual" ? trigger : { ...trigger, status: status === "active" ? "registered" : "paused" },
    ),
    updatedAt: now,
  };
  return writeStoreWithLog({
    ...store,
    automations: store.automations.map((item) => (item.id === automationId ? updated : item)),
  }, createAutomationLog({
    automation: updated,
    type: eventType,
    message,
    createdAt: now,
    source: "client",
    payload: { status, api_surface: "PUT /v1/automations/:id" },
  }));
}

function createSeedCloudRun(input: {
  runId: string;
  automation: CloudAutomation;
  status: "completed" | "failed";
  trigger: CloudAutomationRun["trigger"];
  startedAt: string;
  completedAt: string;
  resultSummary: string;
  errorSummary?: string;
}): CloudAutomationRun {
  const browserbaseSessionId = `bb_seed_${input.runId.slice(-8)}`;
  const events = createRunEvents({
    automation: input.automation,
    runId: input.runId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    status: input.status,
    trigger: input.trigger,
    browserbaseSessionId,
    autonomous: input.status === "completed",
    errorSummary: input.errorSummary,
  });
  return {
    id: input.runId,
    automationId: input.automation.id,
    automationName: input.automation.name,
    workspaceId: input.automation.workspaceId,
    actorAccountId: DEFAULT_ACTOR_ACCOUNT_ID,
    deviceId: DEFAULT_DEVICE_ID,
    status: input.status,
    trigger: input.trigger,
    runMode: "live",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    resultSummary: input.resultSummary,
    errorSummary: input.errorSummary,
    cloudAgentId: `cloud_agent_${input.automation.id}`,
    worker: {
      poolId: `pool_${input.automation.id.slice(-8)}`,
      queue: "basics-runs.fifo",
      fargateTaskArn: `arn:aws:ecs:us-east-1:basics:task/${input.runId}`,
      browserbaseSessionId,
      liveViewUrl: `https://cloud.trybasics.ai/live/${input.runId}`,
      eventsUrl: `/v1/runs/${input.runId}/events`,
      replayJsonlUrl: `s3://basics-replay/${input.automation.workspaceId}/${input.runId}.jsonl`,
    },
    usage: {
      apiCreditsCents: input.status === "completed" ? 21 : 5,
      modelTokens: input.status === "completed" ? 12_100 : 3_800,
      browserMinutes: input.status === "completed" ? 1.4 : 0.5,
      toolCalls: input.status === "completed" ? 10 : 4,
      workerSeconds: input.status === "completed" ? 47 : 20,
    },
    outputs: input.status === "completed" ? createSuccessfulOutputs(input.automation, input.runId, input.completedAt) : [],
    events,
    replayFrames: events.map((event) => createReplayFrame(input.runId, event)),
  };
}

function createRunEvents(input: {
  automation: CloudAutomation;
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: CloudAutomationRunStatus;
  trigger: CloudAutomationRun["trigger"];
  browserbaseSessionId: string;
  autonomous: boolean;
  errorSummary?: string;
}): CloudRunEvent[] {
  const startMs = new Date(input.startedAt).getTime();
  const events: CloudRunEvent[] = [
    createRunEvent({
      automation: input.automation,
      runId: input.runId,
      type: "run_queued",
      message: `${input.trigger} trigger enqueued this automation on basics-runs.fifo.`,
      createdAt: isoFrom(startMs, 0),
      source: input.trigger === "scheduled" ? "scheduler" : "client",
      payload: { queue: "basics-runs.fifo", trigger: input.trigger, api_surface: input.trigger === "manual" ? "POST /v1/automations/:id/run" : "EventBridge Scheduler" },
    }),
    createRunEvent({
      automation: input.automation,
      runId: input.runId,
      type: "run_started",
      message: "Fargate worker claimed the run and started the opencode/browser harness.",
      createdAt: isoFrom(startMs, 0.08),
      source: "worker",
      payload: { pool_id: `pool_${input.automation.id.slice(-8)}`, worker: "basics-cloud-worker", run_mode: "live" },
    }),
    createRunEvent({
      automation: input.automation,
      runId: input.runId,
      type: "browser_session_started",
      message: "Basics Cloud Browser session opened with the workspace browser context.",
      createdAt: isoFrom(startMs, 0.12),
      source: "browser",
      payload: { browserbase_session_id: input.browserbaseSessionId, live_view_url: `https://cloud.trybasics.ai/live/${input.runId}` },
    }),
    createRunEvent({
      automation: input.automation,
      runId: input.runId,
      type: "tool_call_start",
      message: "Worker started the first tool call.",
      createdAt: isoFrom(startMs, 0.2),
      source: "worker",
      toolCallId: `tool_${input.runId.slice(-6)}_read`,
      payload: { tool_slug: browserReadToolFor(input.automation), target: input.automation.requiredCredentials[0] ?? "browser" },
    }),
    createRunEvent({
      automation: input.automation,
      runId: input.runId,
      type: "tool_call_end",
      message: "Tool call completed and wrote an audit row.",
      createdAt: isoFrom(startMs, 0.31),
      source: "worker",
      toolCallId: `tool_${input.runId.slice(-6)}_read`,
      payload: { tool_slug: browserReadToolFor(input.automation), duration_ms: 640, ok: true },
    }),
  ];

  if (input.autonomous) {
    events.push(
      createRunEvent({
        automation: input.automation,
        runId: input.runId,
        type: "approval_auto_approved",
        message: "A narrow remembered trust grant matched this mutating action.",
        createdAt: isoFrom(startMs, 0.44),
        source: "approval",
        payload: { tool_slug: input.automation.approvalPolicy.requireForTools[0] ?? "BROWSER_MUTATION", approval_rule_ids: input.automation.trustGrants.filter((grant) => grant.status === "active").map((grant) => grant.id) },
      }),
      createRunEvent({
        automation: input.automation,
        runId: input.runId,
        type: "tool_call_start",
        message: "Worker started the approved write action.",
        createdAt: isoFrom(startMs, 0.5),
        source: "worker",
        toolCallId: `tool_${input.runId.slice(-6)}_write`,
        payload: { tool_slug: input.automation.approvalPolicy.requireForTools[0] ?? "BROWSER_MUTATION", approved_by: "approval_rules" },
      }),
      createRunEvent({
        automation: input.automation,
        runId: input.runId,
        type: "tool_call_end",
        message: "Write action finished and was verified by read-back.",
        createdAt: isoFrom(startMs, 0.72),
        source: "worker",
        toolCallId: `tool_${input.runId.slice(-6)}_write`,
        payload: { tool_slug: input.automation.approvalPolicy.requireForTools[0] ?? "BROWSER_MUTATION", duration_ms: 930, ok: true, verified_by_readback: true },
      }),
      createRunEvent({
        automation: input.automation,
        runId: input.runId,
        type: "screenshot",
        message: "Browser screenshot uploaded for replay.",
        createdAt: isoFrom(startMs, 0.8),
        source: "browser",
        payload: { s3_key: `screenshots/${input.runId}/final.png`, byte_length: 248_128 },
      }),
      createRunEvent({
        automation: input.automation,
        runId: input.runId,
        type: "output_created",
        message: "Desktop output event written.",
        createdAt: isoFrom(startMs, 0.88),
        source: "cloud",
        payload: { kind: "artifact", target: "basichome dashboard" },
      }),
      createRunEvent({
        automation: input.automation,
        runId: input.runId,
        type: "verification_passed",
        message: "End-of-run verification passed.",
        createdAt: isoFrom(startMs, 0.94),
        source: "worker",
        payload: { check_name: input.automation.checkModules[0] ?? "cloud-verification", replay_jsonl_written: true },
      }),
      createRunEvent({
        automation: input.automation,
        runId: input.runId,
        type: "run_completed",
        message: "Cloud worker completed the run.",
        createdAt: input.completedAt ?? isoFrom(startMs, 1),
        source: "worker",
        payload: { result_summary: "completed", worker_seconds: 52 },
      }),
    );
  } else {
    events.push(
      createRunEvent({
        automation: input.automation,
        runId: input.runId,
        type: "approval_requested",
        message: "Run paused for approval because no active trust grant matched the mutating action.",
        createdAt: isoFrom(startMs, 0.44),
        source: "approval",
        payload: { approval_id: `ap_${input.runId.slice(-10)}`, tool_slug: input.automation.approvalPolicy.requireForTools[0] ?? "BROWSER_MUTATION", remember_available: true },
      }),
    );
    if (input.status === "failed") {
      events.push(
        createRunEvent({
          automation: input.automation,
          runId: input.runId,
          type: "run_failed",
          message: input.errorSummary ?? "Cloud run failed before completion.",
          createdAt: input.completedAt ?? isoFrom(startMs, 1),
          source: "worker",
          payload: { error: input.errorSummary ?? "approval_required", replay_jsonl_written: true },
        }),
      );
    }
  }

  return events;
}

function createRunEvent(input: {
  automation: CloudAutomation;
  runId: string;
  type: CloudRunEventType;
  message: string;
  createdAt: string;
  source: CloudRunEvent["source"];
  toolCallId?: string;
  payload?: Record<string, unknown>;
}): CloudRunEvent {
  return {
    id: createId("evt_cloud"),
    type: input.type,
    message: input.message,
    runId: input.runId,
    automationId: input.automation.id,
    workspaceId: input.automation.workspaceId,
    actorAccountId: DEFAULT_ACTOR_ACCOUNT_ID,
    deviceId: DEFAULT_DEVICE_ID,
    toolCallId: input.toolCallId,
    source: input.source,
    privacyClass: "distilled_cloud",
    createdAt: input.createdAt,
    payload: input.payload,
  };
}

function createAutomationLog(input: {
  automation: CloudAutomation;
  type: CloudRunEventType;
  message: string;
  createdAt: string;
  source: CloudRunEvent["source"];
  payload?: Record<string, unknown>;
}): CloudRunEvent {
  return createRunEvent({
    automation: input.automation,
    runId: input.automation.lastRunId ?? input.automation.id,
    type: input.type,
    message: input.message,
    createdAt: input.createdAt,
    source: input.source,
    payload: input.payload,
  });
}

function writeStoreWithLog(store: CloudAutomationStore, log: CloudRunEvent): CloudAutomationStore {
  return {
    ...store,
    logs: [log, ...store.logs].sort(sortEventsDesc),
  };
}

function limitRuns(store: CloudAutomationStore): CloudAutomationStore {
  return {
    ...store,
    runs: store.runs.slice(0, MAX_RUNS),
    logs: store.logs.slice(0, 600),
  };
}

function createTrustGrant(input: {
  id: string;
  automationId: string;
  label: string;
  toolSlug: string;
  scopeDescription: string;
  constraints: Record<string, unknown>;
  status: CloudTrustGrant["status"];
  decidedVia: CloudTrustGrant["decidedVia"];
  createdAt: string;
}): CloudTrustGrant {
  return {
    id: input.id,
    automationId: input.automationId,
    label: input.label,
    toolSlug: input.toolSlug,
    scopeDescription: input.scopeDescription,
    constraints: input.constraints,
    status: input.status,
    decidedVia: input.decidedVia,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function createSuccessfulOutputs(automation: CloudAutomation, runId: string, createdAt: string): CloudAutomationOutput[] {
  return [
    {
      id: `out_${runId}_summary`,
      runId,
      automationId: automation.id,
      kind: "artifact",
      summary: `${automation.name} completed with verified cloud replay.`,
      target: "basichome dashboard",
      createdAt,
    },
    {
      id: `out_${runId}_log`,
      runId,
      automationId: automation.id,
      kind: "log",
      summary: "Replay JSONL and Browserbase final screenshot are available.",
      target: `s3://basics-replay/${automation.workspaceId}/${runId}.jsonl`,
      createdAt,
    },
  ];
}

function createReplayFrame(runId: string, event: CloudRunEvent): CloudReplayFrame {
  return {
    id: `frame_${event.id}`,
    runId,
    at: event.createdAt,
    event: event.type,
    jsonl: JSON.stringify({
      id: event.id,
      run_id: runId,
      event: event.type,
      source: event.source,
      at: event.createdAt,
      payload: event.payload ?? {},
    }),
  };
}

function replayFrameToEvent(automation: CloudAutomation, runId: string, frame: CloudReplayFrame): CloudRunEvent {
  return createRunEvent({
    automation,
    runId,
    type: "replay_frame_written",
    message: `Replay frame loaded: ${frame.event}.`,
    createdAt: frame.at,
    source: "worker",
    payload: { source_frame_id: frame.id, jsonl: frame.jsonl.slice(0, 220) },
  });
}

function credentialsForDomain(domain: string): string[] {
  if (domain.includes("qbo") || domain.includes("quickbooks")) return ["quickbooks", "gmail", "browserbase"];
  if (domain.includes("jobboard")) return ["jobboardpro", "gmail", "browserbase"];
  if (domain.includes("hubspot")) return ["hubspot", "browserbase"];
  return ["browserbase"];
}

function browserReadToolFor(automation: CloudAutomation): string {
  if (automation.requiredCredentials.includes("quickbooks")) return "QUICKBOOKS_LIST_INVOICES";
  if (automation.requiredCredentials.includes("jobboardpro")) return "BROWSER_EXTRACT_COMPLETED_JOBS";
  if (automation.requiredCredentials.includes("hubspot")) return "HUBSPOT_LIST_CONTACTS";
  return "BROWSER_READ_PAGE";
}

function latestToolName(run: CloudAutomationRun): string | undefined {
  return run.events
    .slice()
    .reverse()
    .map(toolNameFromEvent)
    .find((name) => name !== "cloud_event");
}

function toolNameFromEvent(event: CloudRunEvent): string {
  if (typeof event.payload?.tool_slug === "string") return event.payload.tool_slug;
  if (event.type === "screenshot") return "browser.screenshot";
  if (event.type === "run_failed") return "cloud.run_failed";
  return "cloud_event";
}

function cloudTriggerToRunTrigger(trigger: CloudAutomationRun["trigger"]): RunTrigger {
  if (trigger === "scheduled") return "scheduled";
  if (trigger === "manual") return "manual";
  return "api";
}

function sortEventsDesc(a: CloudRunEvent, b: CloudRunEvent): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function isoFrom(baseMs: number, offsetMinutes: number): string {
  return new Date(baseMs + offsetMinutes * 60_000).toISOString();
}

function createId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`;
}
