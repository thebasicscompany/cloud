export type WorkspaceAppStatus = "installed" | "update_available" | "pending_review" | "blocked";

export type WorkspaceAppTarget = "local" | "cloud" | "local_and_cloud";

export type AppUnitKind = "ui" | "service" | "worker" | "migration";

export type AppReleaseStatus =
  | "draft"
  | "local_installed"
  | "pending_review"
  | "approved"
  | "deploying"
  | "deployed"
  | "rolled_back"
  | "blocked";

export type AppApprovalState = "not_required" | "pending" | "approved" | "rejected";

export type AppDeploymentStatus = "installed" | "pending_review" | "deploying" | "active" | "rolled_back" | "failed";

export type AppLogRuntime = "basichome_cli" | "local_app_runtime" | "basics_cloud_worker" | "admin_review";

export type AppDeploymentTarget = "local" | "cloud";

export type BasicsAppManifestUnit = {
  kind: AppUnitKind;
  name: string;
  path: string;
  runtime: "browser" | "node22" | "sql";
  route?: string;
  schedule?: string;
  queue?: string;
};

export type BasicsAppPermission = {
  slug: string;
  reason: string;
  risk: "read" | "write" | "admin";
};

export type BasicsAppSecret = {
  name: string;
  scope: "device" | "cloud" | "workspace";
  required: boolean;
};

export type BasicsAppRoute = {
  source: string;
  unit: string;
};

export type BasicsAppSchedule = {
  id: string;
  unit: string;
  cron: string;
  timezone: string;
};

export type BasicsAppQueue = {
  name: string;
  unit: string;
  concurrency: number;
};

export type BasicsAppManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  description: string;
  targets: AppDeploymentTarget[];
  units: BasicsAppManifestUnit[];
  permissions: BasicsAppPermission[];
  secrets: BasicsAppSecret[];
  routes: BasicsAppRoute[];
  schedules: BasicsAppSchedule[];
  queues: BasicsAppQueue[];
};

export type AppDeploymentCheck = {
  ok: boolean;
  summary: string;
  errors: string[];
  warnings: string[];
  manifestUnits: number;
  discoveredUnits: number;
  artifactHash?: string;
  scanFindings: Array<{
    severity: "warning" | "blocker";
    message: string;
    path?: string;
  }>;
};

export type WorkspaceAppRelease = {
  id: string;
  appId: string;
  version: string;
  status: AppReleaseStatus;
  approvalState: AppApprovalState;
  target: WorkspaceAppTarget;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  bundlePath: string;
  artifactHash: string;
  scanResult: AppDeploymentCheck;
  manifest: BasicsAppManifest;
};

export type WorkspaceAppDeployment = {
  id: string;
  appId: string;
  releaseId: string;
  target: AppDeploymentTarget;
  status: AppDeploymentStatus;
  endpoint: string;
  serviceStatus: "ready" | "missing" | "deploying" | "failed";
  workerStatus: "ready" | "missing" | "deploying" | "failed";
  migrationStatus: "ready" | "missing" | "applied" | "failed";
  deployedAt: string;
  rolledBackAt?: string;
};

export type WorkspaceAppLogEvent = {
  id: string;
  type:
    | "cli_init"
    | "check_passed"
    | "check_failed"
    | "bundle_built"
    | "local_installed"
    | "review_requested"
    | "approval_granted"
    | "deployment_started"
    | "deployment_completed"
    | "rollback_completed"
    | "worker_heartbeat";
  message: string;
  appId: string;
  releaseId?: string;
  deploymentId?: string;
  actorAccountId: string;
  deviceId: string;
  target: string;
  runtime: AppLogRuntime;
  source: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

export type WorkspaceApp = {
  id: string;
  name: string;
  description: string;
  version: string;
  status: WorkspaceAppStatus;
  target: WorkspaceAppTarget;
  owner: string;
  updatedAt: string;
  permissions: string[];
  health: "healthy" | "warning" | "blocked";
  lastEvent: string;
  cliProjectPath: string;
  manifest: BasicsAppManifest;
  activeReleaseId?: string;
  pendingReleaseId?: string;
  deploymentIds: string[];
};

export type WorkspaceAppsStore = {
  schemaVersion: 1;
  apps: WorkspaceApp[];
  releases: WorkspaceAppRelease[];
  deployments: WorkspaceAppDeployment[];
  logs: WorkspaceAppLogEvent[];
  selectedAppId?: string;
};
