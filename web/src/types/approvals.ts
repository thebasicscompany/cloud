import type { WorkspaceAppTarget } from "@/types/apps";

export type WorkspaceRole = "owner" | "admin" | "developer" | "member" | "device_owner";

export type WorkspaceApprovalKind =
  | "app_release"
  | "app_update"
  | "automation_promotion"
  | "trust_grant"
  | "cloud_run"
  | "browser_credential"
  | "workspace_credential"
  | "capture_sync"
  | "training_consent"
  | "spend_policy";

export type WorkspaceApprovalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "expired"
  | "revoked";

export type WorkspaceApprovalRisk = "low" | "medium" | "high" | "critical";

export type WorkspaceApprovalAction = "approve" | "reject" | "request_changes" | "revoke";

export type WorkspacePolicyMode = "manual_approval" | "auto_deploy_after_checks" | "staged_rollout_after_checks";

export type WorkspaceMember = {
  id: string;
  name: string;
  email: string;
  roles: WorkspaceRole[];
  deviceId?: string;
};

export type WorkspacePolicy = {
  workspaceId: string;
  appInstallPolicy: "admin_approval_required" | "user_install_allowed" | "blocked";
  permissionExpandingUpdates: "admin_approval_required";
  lowRiskPatchMode: WorkspacePolicyMode;
  automationAutonomyPolicy: "first_run_approval" | "risk_based" | "trusted_autonomous";
  trustGrantMaxDays: number;
  captureSyncMode: "raw_local_only" | "distilled_cloud_allowed";
  trainingMode: "disabled" | "evals_only" | "workflow_learning" | "org_model_training";
  cloudBudgetCentsDaily: number;
};

export type WorkspaceTrustGrant = {
  id: string;
  approvalId: string;
  label: string;
  automationId: string;
  actionClass: string;
  actorAccountId: string;
  target: "local" | "cloud";
  scope: {
    tools: string[];
    connectedAccounts: string[];
    domains: string[];
    recipients: string[];
    amountLimitCents?: number;
    runLimitPerDay?: number;
  };
  status: "pending" | "active" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
};

export type WorkspaceApprovalCheck = {
  label: string;
  status: "passed" | "failed" | "warning" | "not_run";
  detail: string;
};

export type WorkspaceApprovalChange = {
  label: string;
  before: string;
  after: string;
  expandsPermission: boolean;
};

export type WorkspaceApprovalLogEvent = {
  id: string;
  approvalId: string;
  event: "requested" | "policy_evaluated" | "approved" | "rejected" | "changes_requested" | "deployed" | "revoked";
  actorAccountId: string;
  actorRole: WorkspaceRole;
  message: string;
  createdAt: string;
};

export type WorkspaceApproval = {
  id: string;
  workspaceId: string;
  kind: WorkspaceApprovalKind;
  status: WorkspaceApprovalStatus;
  risk: WorkspaceApprovalRisk;
  objectName: string;
  objectId: string;
  appId?: string;
  releaseId?: string;
  automationId?: string;
  trustGrantId?: string;
  requestedBy: WorkspaceMember;
  requestedFor: WorkspaceAppTarget | "workspace_policy" | "automation" | "device_local";
  requiredRole: WorkspaceRole;
  reason: string;
  summary: string;
  requestedAccess: string[];
  runtimeUnits: Array<{
    kind: "ui" | "service" | "worker" | "migration" | "schedule" | "route" | "queue" | "tool";
    name: string;
    detail: string;
  }>;
  checks: WorkspaceApprovalCheck[];
  changes: WorkspaceApprovalChange[];
  artifactHash?: string;
  rolloutTarget: WorkspaceAppTarget | "automation" | "workspace_policy" | "device_local";
  rollbackPlan: string;
  dataBoundary: string;
  costAndLimits: string;
  tests: string[];
  logs: WorkspaceApprovalLogEvent[];
  requestedAt: string;
  expiresAt?: string;
  decidedAt?: string;
  decidedBy?: WorkspaceMember;
  decisionReason?: string;
};

export type WorkspaceApprovalStore = {
  schemaVersion: 1;
  workspaceId: string;
  members: WorkspaceMember[];
  currentActorId: string;
  policy: WorkspacePolicy;
  approvals: WorkspaceApproval[];
  trustGrants: WorkspaceTrustGrant[];
  logs: WorkspaceApprovalLogEvent[];
};

export type PolicyDecision =
  | {
      allowed: true;
      reason: string;
      approvalRequired: false;
    }
  | {
      allowed: false;
      reason: string;
      approvalRequired: true;
      requiredRole: WorkspaceRole;
      approvalKind: WorkspaceApprovalKind;
    };
