import type {
  PolicyDecision,
  WorkspaceApproval,
  WorkspaceApprovalAction,
  WorkspaceApprovalKind,
  WorkspaceApprovalLogEvent,
  WorkspaceApprovalStatus,
  WorkspaceApprovalStore,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceTrustGrant,
} from "@/types/approvals";

export const BASICHOME_APPROVALS_STORAGE_KEY = "basichome:workspace-approvals:v1";

const WORKSPACE_ID = "workspace_local";
const OWNER_ID = "local-dev-owner";
const DEVELOPER_ID = "dev-app-builder";
const MEMBER_ID = "member-ops";
const DEVICE_OWNER_ID = "device-owner-this-mac";

export function createInitialApprovalStore(): WorkspaceApprovalStore {
  const now = Date.now();
  const members = createMembers();
  const owner = members.find((member) => member.id === OWNER_ID)!;
  const developer = members.find((member) => member.id === DEVELOPER_ID)!;

  const trustApprovalId = "appr_trust_eod_invoice_email";
  const trustGrant: WorkspaceTrustGrant = {
    id: "trust_eod_invoice_email_500",
    approvalId: trustApprovalId,
    label: "Invoice reminder email trust",
    automationId: "auto_eod_invoice_review",
    actionClass: "outbound_email",
    actorAccountId: OWNER_ID,
    target: "cloud",
    scope: {
      tools: ["GMAIL_SEND_EMAIL"],
      connectedAccounts: ["gmail:sales@company.test"],
      domains: ["customer-billing"],
      recipients: ["known customer billing contacts"],
      amountLimitCents: 50_000,
      runLimitPerDay: 1,
    },
    status: "active",
    createdAt: isoFrom(now, -1_380),
    expiresAt: isoFrom(now, 42_000),
    lastUsedAt: isoFrom(now, -42),
  };

  const approvals: WorkspaceApproval[] = [
    {
      id: "appr_app_quote_router_010",
      workspaceId: WORKSPACE_ID,
      kind: "app_release",
      status: "pending",
      risk: "medium",
      objectName: "Quote Router 0.1.0",
      objectId: "rel_quote_router_010",
      appId: "app_quote_router",
      releaseId: "rel_quote_router_010",
      requestedBy: developer,
      requestedFor: "local_and_cloud",
      requiredRole: "admin",
      reason: "Developer published a private app release for workspace rollout.",
      summary: "Deploys the Quote Router dashboard, Node API, enrichment worker, and migration to local clients and Basics Cloud.",
      requestedAccess: [
        "Read CRM lead records.",
        "Draft Gmail follow-up emails after approval.",
        "Write app and worker logs into the workspace audit stream.",
      ],
      runtimeUnits: [
        { kind: "ui", name: "dashboard", detail: "apps/dashboard/index.html" },
        { kind: "service", name: "api", detail: "services/api/src/index.ts" },
        { kind: "worker", name: "lead-enrichment", detail: "workers/lead-enrichment/src/index.ts" },
        { kind: "migration", name: "schema", detail: "migrations/0001_quote_router.sql" },
      ],
      checks: [
        { label: "Manifest validation", status: "passed", detail: "All UI, service, worker, migration, route, schedule, queue, permission, and secret declarations are present." },
        { label: "Static scan", status: "passed", detail: "No secret, child_process, eval, or external network blockers found." },
        { label: "Tests", status: "passed", detail: "CLI smoke test and web runtime tests passed." },
        { label: "Rollback plan", status: "passed", detail: "Previous release rel_quote_router_009 remains active until health checks pass." },
      ],
      changes: [
        { label: "Version", before: "0.0.9", after: "0.1.0", expandsPermission: false },
        { label: "Cloud worker", before: "none", after: "lead-enrichment worker", expandsPermission: true },
      ],
      artifactHash: "sha256:2d2a1a87694c478d45d701565a7ed0efc492d73b354a7ec205986b7e2e12195a",
      rolloutTarget: "local_and_cloud",
      rollbackPlan: "Keep rel_quote_router_009 active until local install and cloud health checks pass; rollback returns clients and cloud worker to 0.0.9.",
      dataBoundary: "Raw Lens capture stays on the device. The app can read approved CRM fields and write action logs; admins cannot browse raw screenshots.",
      costAndLimits: "Cloud worker budget cap 150 cents per day, 10 browser minutes per run, replay retained 7 days.",
      tests: ["basics app check", "basics app build", "web runtime tests", "React Doctor 100"],
      logs: [],
      requestedAt: isoFrom(now, -24),
      expiresAt: isoFrom(now, 1_416),
    },
    {
      id: "appr_app_lead_research_099_permission_expansion",
      workspaceId: WORKSPACE_ID,
      kind: "app_update",
      status: "pending",
      risk: "high",
      objectName: "Lead Research Desk 0.9.9",
      objectId: "rel_lead_desk_099",
      appId: "app_lead_research",
      releaseId: "rel_lead_desk_099",
      requestedBy: developer,
      requestedFor: "cloud",
      requiredRole: "admin",
      reason: "This update expands permissions from read-only research to writing CRM fields and running a cloud browser.",
      summary: "Adds HubSpot write access, cloud browser research, and scheduled enrichment for target accounts.",
      requestedAccess: [
        "Write enriched fields to HubSpot.",
        "Use Basics Cloud Browser for long-running account research.",
        "Read local browser metadata but not raw cookies.",
      ],
      runtimeUnits: [
        { kind: "ui", name: "research-desk", detail: "apps/dashboard/index.html" },
        { kind: "service", name: "api", detail: "services/api/src/index.ts" },
        { kind: "worker", name: "account-enrichment", detail: "workers/lead-enrichment/src/index.ts" },
        { kind: "schedule", name: "nightly-enrichment", detail: "0 2 * * 1-5" },
      ],
      checks: [
        { label: "Manifest validation", status: "passed", detail: "Declared service and worker units match project files." },
        { label: "Permission diff", status: "warning", detail: "New write and cloud browser permissions require admin approval." },
        { label: "Static scan", status: "passed", detail: "No blockers found." },
      ],
      changes: [
        { label: "HubSpot", before: "hubspot.read", after: "hubspot.write", expandsPermission: true },
        { label: "Browser", before: "browser.local", after: "browser.local + browser.cloud", expandsPermission: true },
        { label: "Schedule", before: "manual only", after: "weekday nightly enrichment", expandsPermission: true },
      ],
      artifactHash: "sha256:5f8c28b7fda8195ff1126e35fb4f282c0be403250f29875c6a3fa45286ef73fd",
      rolloutTarget: "cloud",
      rollbackPlan: "Keep current 0.9.8 app active. If cloud health checks fail, do not switch the active catalog version.",
      dataBoundary: "Raw local browser profiles stay local. Only approved site metadata and cloud browser replay references enter workspace logs.",
      costAndLimits: "Cloud browser budget cap 300 cents per day, 30 browser minutes per run, 5 concurrent account jobs.",
      tests: ["basics app check", "permission-diff policy gate", "cloud deploy dry run"],
      logs: [],
      requestedAt: isoFrom(now, -78),
      expiresAt: isoFrom(now, 1_362),
    },
    {
      id: trustApprovalId,
      workspaceId: WORKSPACE_ID,
      kind: "trust_grant",
      status: "approved",
      risk: "medium",
      objectName: "End-of-day invoicing trust grant",
      objectId: trustGrant.id,
      automationId: trustGrant.automationId,
      trustGrantId: trustGrant.id,
      requestedBy: owner,
      requestedFor: "automation",
      requiredRole: "admin",
      reason: "Owner approved a scoped autonomous email send rule after a clean first run.",
      summary: "Allows the invoicing automation to send customer billing emails under tight recipient and amount limits.",
      requestedAccess: [
        "Use Gmail send only for known customer billing contacts.",
        "Send only invoices or reminders under 500 dollars.",
        "Run once per weekday after the scheduled review.",
      ],
      runtimeUnits: [
        { kind: "tool", name: "GMAIL_SEND_EMAIL", detail: "outbound email tool" },
        { kind: "schedule", name: "weekday-eod", detail: "0 18 * * 1-5" },
      ],
      checks: [
        { label: "First run review", status: "passed", detail: "The first live run completed with admin approval." },
        { label: "Scope limits", status: "passed", detail: "Recipient kind, amount, schedule, and account constraints are present." },
      ],
      changes: [
        { label: "Approval mode", before: "first run review", after: "trusted autonomous", expandsPermission: true },
      ],
      rolloutTarget: "automation",
      rollbackPlan: "Revoke the trust grant; future scheduled runs pause at the next mutating Gmail action.",
      dataBoundary: "No raw Lens capture is uploaded. The automation reads approved job and invoice summaries only.",
      costAndLimits: "Max 1 run per weekday, max 500 dollars invoice amount per send, expires in 30 days.",
      tests: ["first-run approval", "trust grant scope check", "revoke simulation"],
      logs: [],
      requestedAt: isoFrom(now, -1_440),
      decidedAt: isoFrom(now, -1_380),
      decidedBy: owner,
      decisionReason: "Approved after clean first run.",
    },
    {
      id: "appr_training_consent_evals_only",
      workspaceId: WORKSPACE_ID,
      kind: "training_consent",
      status: "changes_requested",
      risk: "critical",
      objectName: "Training consent: workflow learning",
      objectId: "policy_training_workflow_learning",
      requestedBy: developer,
      requestedFor: "workspace_policy",
      requiredRole: "owner",
      reason: "Request needs a narrower data boundary before any training/eval consent can change.",
      summary: "Would allow selected redacted workflow traces to feed future workflow learning.",
      requestedAccess: ["Use redacted action logs and accepted suggestions for workflow learning."],
      runtimeUnits: [{ kind: "tool", name: "policy", detail: "workspace training policy" }],
      checks: [
        { label: "Consent copy", status: "warning", detail: "Needs clearer deletion/export language." },
        { label: "Raw capture boundary", status: "passed", detail: "Raw screenshots remain excluded." },
      ],
      changes: [
        { label: "Training mode", before: "disabled", after: "workflow_learning", expandsPermission: true },
      ],
      rolloutTarget: "workspace_policy",
      rollbackPlan: "Training mode remains disabled until the owner approves a narrower request.",
      dataBoundary: "Raw local Lens capture is excluded. Request needs clearer redaction and deletion terms.",
      costAndLimits: "No immediate runtime cost.",
      tests: ["policy diff", "consent wording review"],
      logs: [],
      requestedAt: isoFrom(now, -2_100),
      decidedAt: isoFrom(now, -2_020),
      decidedBy: owner,
      decisionReason: "Request explicit deletion/export wording.",
    },
    {
      id: "appr_browser_profile_cloud_sync",
      workspaceId: WORKSPACE_ID,
      kind: "browser_credential",
      status: "rejected",
      risk: "high",
      objectName: "Cloud browser profile sync",
      objectId: "profile_local_jobboard",
      requestedBy: developer,
      requestedFor: "device_local",
      requiredRole: "device_owner",
      reason: "Device owner rejected cloud use for a local browser profile.",
      summary: "Would copy selected site session material into a managed cloud browser profile.",
      requestedAccess: ["Copy selected site cookies into Basics Cloud Browser after device-owner consent."],
      runtimeUnits: [{ kind: "tool", name: "browser profile", detail: "managed browser profile import" }],
      checks: [
        { label: "Device-owner consent", status: "failed", detail: "The device owner rejected this sync." },
      ],
      changes: [
        { label: "Browser profile", before: "device only", after: "cloud browser", expandsPermission: true },
      ],
      rolloutTarget: "device_local",
      rollbackPlan: "Profile remains local and cloud promotion stays blocked.",
      dataBoundary: "Cookie values are never logged. Cloud profile copy requires explicit device-owner approval.",
      costAndLimits: "No cloud browser usage until approved.",
      tests: ["device consent gate"],
      logs: [],
      requestedAt: isoFrom(now, -4_200),
      decidedAt: isoFrom(now, -4_180),
      decidedBy: members.find((member) => member.id === DEVICE_OWNER_ID),
      decisionReason: "Keep profile local for now.",
    },
    {
      id: "appr_spend_policy_daily_cap",
      workspaceId: WORKSPACE_ID,
      kind: "spend_policy",
      status: "expired",
      risk: "medium",
      objectName: "Raise cloud daily cap",
      objectId: "policy_cloud_budget",
      requestedBy: developer,
      requestedFor: "workspace_policy",
      requiredRole: "owner",
      reason: "Request expired without owner decision.",
      summary: "Would raise the workspace cloud automation daily budget from 500 cents to 2500 cents.",
      requestedAccess: ["Increase daily workspace managed-credit spend limit."],
      runtimeUnits: [{ kind: "tool", name: "billing policy", detail: "workspace cloud budget" }],
      checks: [{ label: "Owner approval", status: "not_run", detail: "No owner decision before expiry." }],
      changes: [
        { label: "Daily budget", before: "500 cents", after: "2500 cents", expandsPermission: true },
      ],
      rolloutTarget: "workspace_policy",
      rollbackPlan: "Current budget remains 500 cents per day.",
      dataBoundary: "No data policy change.",
      costAndLimits: "Would raise daily cloud spend limit.",
      tests: ["budget policy gate"],
      logs: [],
      requestedAt: isoFrom(now, -7_200),
      expiresAt: isoFrom(now, -5_760),
    },
  ];

  const approvalsWithLogs = approvals.map((approval) => ({
    ...approval,
    logs: seedLogsForApproval(approval),
  }));
  const logs = approvalsWithLogs.flatMap((approval) => approval.logs).sort(sortLogsDesc);

  return {
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    members,
    currentActorId: OWNER_ID,
    policy: {
      workspaceId: WORKSPACE_ID,
      appInstallPolicy: "admin_approval_required",
      permissionExpandingUpdates: "admin_approval_required",
      lowRiskPatchMode: "manual_approval",
      automationAutonomyPolicy: "first_run_approval",
      trustGrantMaxDays: 30,
      captureSyncMode: "raw_local_only",
      trainingMode: "disabled",
      cloudBudgetCentsDaily: 500,
    },
    approvals: approvalsWithLogs,
    trustGrants: [trustGrant],
    logs,
  };
}

export function readApprovalStore(): WorkspaceApprovalStore {
  if (typeof window === "undefined") return createInitialApprovalStore();

  const stored = window.localStorage.getItem(BASICHOME_APPROVALS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<WorkspaceApprovalStore>;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.approvals) && Array.isArray(parsed.members)) {
        return withSeedDefaults({
          schemaVersion: 1,
          workspaceId: parsed.workspaceId ?? WORKSPACE_ID,
          members: parsed.members as WorkspaceMember[],
          currentActorId: parsed.currentActorId ?? OWNER_ID,
          policy: parsed.policy ?? createInitialApprovalStore().policy,
          approvals: parsed.approvals as WorkspaceApproval[],
          trustGrants: Array.isArray(parsed.trustGrants) ? (parsed.trustGrants as WorkspaceTrustGrant[]) : [],
          logs: Array.isArray(parsed.logs) ? (parsed.logs as WorkspaceApprovalLogEvent[]) : [],
        });
      }
    } catch {
      window.localStorage.removeItem(BASICHOME_APPROVALS_STORAGE_KEY);
    }
  }

  const seeded = createInitialApprovalStore();
  writeApprovalStore(seeded);
  return seeded;
}

export function writeApprovalStore(store: WorkspaceApprovalStore): WorkspaceApprovalStore {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASICHOME_APPROVALS_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function listApprovals(store: WorkspaceApprovalStore, status: WorkspaceApprovalStatus | "all" = "all"): WorkspaceApproval[] {
  const approvals = status === "all" ? store.approvals : store.approvals.filter((approval) => approval.status === status);
  return approvals.slice().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function findApproval(store: WorkspaceApprovalStore, approvalId: string | undefined): WorkspaceApproval | undefined {
  if (!approvalId) return undefined;
  return store.approvals.find((approval) => approval.id === approvalId);
}

export function getCurrentActor(store: WorkspaceApprovalStore): WorkspaceMember {
  return store.members.find((member) => member.id === store.currentActorId) ?? store.members[0]!;
}

export function canApprove(actor: WorkspaceMember, approval: WorkspaceApproval): boolean {
  if (approval.checks.some((check) => check.status === "failed")) return false;
  if (approval.requiredRole === "owner") return actor.roles.includes("owner");
  if (approval.requiredRole === "device_owner") return actor.roles.includes("device_owner") || actor.roles.includes("owner");
  return actor.roles.includes("owner") || actor.roles.includes("admin");
}

export function canRequestChanges(actor: WorkspaceMember, approval: WorkspaceApproval): boolean {
  return approval.status === "pending" && canReview(actor, approval);
}

export function canReview(actor: WorkspaceMember, approval: WorkspaceApproval): boolean {
  return canApprove(actor, approval) || actor.roles.includes("admin") || actor.roles.includes("owner");
}

export function evaluateApprovalPolicy(params: {
  actorRoles: WorkspaceRole[];
  kind: WorkspaceApprovalKind;
  expandsPermissions: boolean;
  scanOk: boolean;
  target: "local" | "cloud" | "local_and_cloud" | "workspace_policy" | "automation" | "device_local";
}): PolicyDecision {
  const admin = params.actorRoles.includes("owner") || params.actorRoles.includes("admin");
  if (!params.scanOk) {
    return {
      allowed: false,
      approvalRequired: true,
      requiredRole: "admin",
      approvalKind: params.kind,
      reason: "Package scan or policy check failed; approval remains blocked until the failure is fixed.",
    };
  }
  if (params.target === "device_local" && !params.actorRoles.includes("device_owner") && !params.actorRoles.includes("owner")) {
    return {
      allowed: false,
      approvalRequired: true,
      requiredRole: "device_owner",
      approvalKind: params.kind,
      reason: "Device-local browser or capture changes require the device owner.",
    };
  }
  if (params.kind === "training_consent" || params.kind === "spend_policy") {
    if (params.actorRoles.includes("owner")) {
      return { allowed: true, approvalRequired: false, reason: "Owner can decide workspace training and spend policy." };
    }
    return {
      allowed: false,
      approvalRequired: true,
      requiredRole: "owner",
      approvalKind: params.kind,
      reason: "Training and spend policy require owner approval.",
    };
  }
  if (params.expandsPermissions || params.target === "cloud" || params.target === "local_and_cloud") {
    if (admin) return { allowed: true, approvalRequired: false, reason: "Workspace admin can approve permission-expanding or cloud rollout decisions." };
    return {
      allowed: false,
      approvalRequired: true,
      requiredRole: "admin",
      approvalKind: params.kind,
      reason: "Permission-expanding and cloud rollout changes require workspace admin approval.",
    };
  }
  if (admin || params.actorRoles.includes("developer")) {
    return { allowed: true, approvalRequired: false, reason: "Non-expanding local development action is allowed." };
  }
  return {
    allowed: false,
    approvalRequired: true,
    requiredRole: "admin",
    approvalKind: params.kind,
    reason: "Members can request, but not approve workspace-wide changes.",
  };
}

export function approvalExpandsPermissions(approval: WorkspaceApproval): boolean {
  return approval.changes.some((change) => change.expandsPermission);
}

export function evaluateAutonomousRunPolicy(store: WorkspaceApprovalStore, automationId: string): {
  allowed: boolean;
  mode: "trusted_autonomous" | "approval_required";
  reason: string;
  grant?: WorkspaceTrustGrant;
} {
  const activeGrant = store.trustGrants.find((grant) => grant.automationId === automationId && grant.status === "active" && new Date(grant.expiresAt).getTime() > Date.now());
  if (activeGrant) {
    return {
      allowed: true,
      mode: "trusted_autonomous",
      reason: "An active scoped trust grant matches this automation.",
      grant: activeGrant,
    };
  }
  return {
    allowed: false,
    mode: "approval_required",
    reason: "No active trust grant matches this automation; future mutating actions must pause for approval.",
  };
}

export function decideApproval(
  store: WorkspaceApprovalStore,
  approvalId: string,
  action: WorkspaceApprovalAction,
  reason?: string,
): WorkspaceApprovalStore {
  const actor = getCurrentActor(store);
  const approval = findApproval(store, approvalId);
  if (!approval) return store;
  const now = new Date().toISOString();

  if (action === "approve" && !canApprove(actor, approval)) {
    return appendApprovalLog(store, approval, "policy_evaluated", actor, `Approval blocked: ${actor.name} lacks ${approval.requiredRole} rights or checks failed.`);
  }
  if ((action === "reject" || action === "request_changes") && !canReview(actor, approval)) {
    return appendApprovalLog(store, approval, "policy_evaluated", actor, `Decision blocked: ${actor.name} cannot review this request.`);
  }

  if (action === "revoke") return revokeTrustGrant(store, approval.trustGrantId ?? approval.objectId, reason);

  const status: WorkspaceApprovalStatus =
    action === "approve"
      ? "approved"
      : action === "reject"
        ? "rejected"
        : "changes_requested";
  const event: WorkspaceApprovalLogEvent["event"] =
    action === "approve"
      ? "approved"
      : action === "reject"
        ? "rejected"
        : "changes_requested";
  const message =
    action === "approve"
      ? `${actor.name} approved ${approval.objectName}.`
      : action === "reject"
        ? `${actor.name} rejected ${approval.objectName}.`
        : `${actor.name} requested changes for ${approval.objectName}.`;
  const log = createApprovalLog(approval, event, actor, reason ? `${message} ${reason}` : message, now);

  return {
    ...store,
    approvals: store.approvals.map((candidate) =>
      candidate.id === approvalId
        ? {
            ...candidate,
            status,
            decidedAt: now,
            decidedBy: actor,
            decisionReason: reason,
            logs: [log, ...candidate.logs],
          }
        : candidate,
    ),
    logs: [log, ...store.logs].sort(sortLogsDesc),
  };
}

export function markApprovalDeployed(store: WorkspaceApprovalStore, approvalId: string): WorkspaceApprovalStore {
  const actor = getCurrentActor(store);
  const approval = findApproval(store, approvalId);
  if (!approval) return store;
  const log = createApprovalLog(approval, "deployed", actor, `basichome deployed ${approval.objectName} after approval.`);
  return {
    ...store,
    approvals: store.approvals.map((candidate) =>
      candidate.id === approvalId
        ? {
            ...candidate,
            logs: [log, ...candidate.logs],
          }
        : candidate,
    ),
    logs: [log, ...store.logs].sort(sortLogsDesc),
  };
}

export function revokeTrustGrant(store: WorkspaceApprovalStore, trustGrantId: string, reason?: string): WorkspaceApprovalStore {
  const actor = getCurrentActor(store);
  const grant = store.trustGrants.find((candidate) => candidate.id === trustGrantId);
  if (!grant) return store;
  const approval = findApproval(store, grant.approvalId);
  if (!approval) return store;
  const now = new Date().toISOString();
  const log = createApprovalLog(
    approval,
    "revoked",
    actor,
    reason ? `${actor.name} revoked ${grant.label}. ${reason}` : `${actor.name} revoked ${grant.label}. Future autonomous runs must pause.`,
    now,
  );
  return {
    ...store,
    trustGrants: store.trustGrants.map((candidate) =>
      candidate.id === trustGrantId ? { ...candidate, status: "revoked" as const, revokedAt: now } : candidate,
    ),
    approvals: store.approvals.map((candidate) =>
      candidate.id === grant.approvalId
        ? {
            ...candidate,
            status: "revoked" as const,
            decidedAt: now,
            decidedBy: actor,
            decisionReason: reason ?? "Trust grant revoked.",
            logs: [log, ...candidate.logs],
          }
        : candidate,
    ),
    logs: [log, ...store.logs].sort(sortLogsDesc),
  };
}

function appendApprovalLog(
  store: WorkspaceApprovalStore,
  approval: WorkspaceApproval,
  event: WorkspaceApprovalLogEvent["event"],
  actor: WorkspaceMember,
  message: string,
): WorkspaceApprovalStore {
  const log = createApprovalLog(approval, event, actor, message);
  return {
    ...store,
    approvals: store.approvals.map((candidate) => candidate.id === approval.id ? { ...candidate, logs: [log, ...candidate.logs] } : candidate),
    logs: [log, ...store.logs].sort(sortLogsDesc),
  };
}

function withSeedDefaults(store: WorkspaceApprovalStore): WorkspaceApprovalStore {
  const seeded = createInitialApprovalStore();
  const memberIds = new Set(store.members.map((member) => member.id));
  const approvalIds = new Set(store.approvals.map((approval) => approval.id));
  const grantIds = new Set(store.trustGrants.map((grant) => grant.id));
  const logIds = new Set(store.logs.map((log) => log.id));
  return {
    ...store,
    members: [...store.members, ...seeded.members.filter((member) => !memberIds.has(member.id))],
    approvals: [...store.approvals, ...seeded.approvals.filter((approval) => !approvalIds.has(approval.id))],
    trustGrants: [...store.trustGrants, ...seeded.trustGrants.filter((grant) => !grantIds.has(grant.id))],
    logs: [...store.logs, ...seeded.logs.filter((log) => !logIds.has(log.id))].sort(sortLogsDesc),
  };
}

function createMembers(): WorkspaceMember[] {
  return [
    {
      id: OWNER_ID,
      name: "basichome local owner",
      email: "local@basichome.dev",
      roles: ["owner", "admin", "developer", "device_owner"],
      deviceId: "device_local_dev",
    },
    {
      id: DEVELOPER_ID,
      name: "Maya Developer",
      email: "maya.dev@example.com",
      roles: ["developer"],
    },
    {
      id: MEMBER_ID,
      name: "Jordan Member",
      email: "jordan.member@example.com",
      roles: ["member"],
    },
    {
      id: DEVICE_OWNER_ID,
      name: "This Mac Device Owner",
      email: "device.owner@example.com",
      roles: ["device_owner"],
      deviceId: "device_local_dev",
    },
  ];
}

function seedLogsForApproval(approval: WorkspaceApproval): WorkspaceApprovalLogEvent[] {
  const logs = [
    createApprovalLog(
      approval,
      "requested",
      approval.requestedBy,
      `${approval.requestedBy.name} requested ${approval.objectName}.`,
      approval.requestedAt,
    ),
  ];
  if (approval.status === "approved" && approval.decidedBy && approval.decidedAt) {
    logs.unshift(createApprovalLog(approval, "approved", approval.decidedBy, approval.decisionReason ?? `${approval.objectName} approved.`, approval.decidedAt));
  }
  if (approval.status === "rejected" && approval.decidedBy && approval.decidedAt) {
    logs.unshift(createApprovalLog(approval, "rejected", approval.decidedBy, approval.decisionReason ?? `${approval.objectName} rejected.`, approval.decidedAt));
  }
  if (approval.status === "changes_requested" && approval.decidedBy && approval.decidedAt) {
    logs.unshift(createApprovalLog(approval, "changes_requested", approval.decidedBy, approval.decisionReason ?? `Changes requested for ${approval.objectName}.`, approval.decidedAt));
  }
  return logs;
}

function createApprovalLog(
  approval: WorkspaceApproval,
  event: WorkspaceApprovalLogEvent["event"],
  actor: WorkspaceMember,
  message: string,
  createdAt = new Date().toISOString(),
): WorkspaceApprovalLogEvent {
  return {
    id: `log_${approval.id}_${event}_${createdAt.replace(/\W/g, "").slice(0, 14)}`,
    approvalId: approval.id,
    event,
    actorAccountId: actor.id,
    actorRole: actor.roles[0] ?? "member",
    message,
    createdAt,
  };
}

function sortLogsDesc(a: WorkspaceApprovalLogEvent, b: WorkspaceApprovalLogEvent): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function isoFrom(nowMs: number, minutesOffset: number): string {
  return new Date(nowMs + minutesOffset * 60_000).toISOString();
}
