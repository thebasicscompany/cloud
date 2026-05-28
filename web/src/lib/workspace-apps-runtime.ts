import type {
  AppDeploymentCheck,
  AppDeploymentTarget,
  AppUnitKind,
  BasicsAppManifest,
  BasicsAppManifestUnit,
  WorkspaceApp,
  WorkspaceAppDeployment,
  WorkspaceAppLogEvent,
  WorkspaceAppRelease,
  WorkspaceAppsStore,
} from "@/types/apps";

export const BASICHOME_WORKSPACE_APPS_STORAGE_KEY = "basichome:workspace-apps:v1";

const DEFAULT_ACTOR_ACCOUNT_ID = "local-dev-owner";
const DEFAULT_DEVICE_ID = "device_local_dev";
const DEFAULT_WORKSPACE_PATH = "~/basichome/apps";

type DeploymentCheckInput = {
  filePaths?: string[];
  fileContents?: Record<string, string>;
  artifactHash?: string;
};

export function createInitialWorkspaceAppsStore(): WorkspaceAppsStore {
  const now = Date.now();
  const quoteManifest = createQuoteRouterManifest("0.1.0");
  const quotePreviousManifest = createQuoteRouterManifest("0.0.9");
  const invoiceManifest = createInvoiceManifest("1.4.2");
  const leadManifest = createLeadDeskManifest("0.9.9");
  const supportManifest = createSupportRouterManifest("0.3.0-rc.2");
  const inventoryManifest = createInventoryManifest("0.1.6");

  const quotePreviousCheck = runAppDeploymentCheck(quotePreviousManifest, {
    filePaths: fullStackInventory(quotePreviousManifest),
    artifactHash: "sha256:7b7f1b18e8516010c6a344b3486025a7b0b0833b87663eb3dd3f2f83e917d40b",
  });
  const quoteCheck = runAppDeploymentCheck(quoteManifest, {
    filePaths: fullStackInventory(quoteManifest),
    artifactHash: "sha256:2d2a1a87694c478d45d701565a7ed0efc492d73b354a7ec205986b7e2e12195a",
  });
  const invoiceCheck = runAppDeploymentCheck(invoiceManifest, {
    filePaths: fullStackInventory(invoiceManifest),
    artifactHash: "sha256:aa8cfb789f445bb983e2149fbe2d179acbd3a7f55067e9a44126f02a63092b0d",
  });
  const leadCheck = runAppDeploymentCheck(leadManifest, {
    filePaths: fullStackInventory(leadManifest),
    artifactHash: "sha256:5f8c28b7fda8195ff1126e35fb4f282c0be403250f29875c6a3fa45286ef73fd",
  });
  const supportCheck = runAppDeploymentCheck(supportManifest, {
    filePaths: fullStackInventory(supportManifest),
    artifactHash: "sha256:b704dc8413ed47573cb6f011f4f985c1e7f3b51383081bfb7e89fc99f0fa9b3a",
  });
  const inventoryCheck = runAppDeploymentCheck(inventoryManifest, {
    filePaths: ["apps/dashboard/index.html", "workers/sync/src/index.ts", "services/api/src/index.ts"],
    artifactHash: "sha256:blocked",
  });

  const releases: WorkspaceAppRelease[] = [
    createRelease({
      id: "rel_quote_router_009",
      manifest: quotePreviousManifest,
      status: "deployed",
      approvalState: "approved",
      target: "local_and_cloud",
      requestedAt: isoFrom(now, -7_300),
      approvedAt: isoFrom(now, -7_250),
      artifactHash: quotePreviousCheck.artifactHash!,
      check: quotePreviousCheck,
    }),
    createRelease({
      id: "rel_quote_router_010",
      manifest: quoteManifest,
      status: "pending_review",
      approvalState: "pending",
      target: "local_and_cloud",
      requestedAt: isoFrom(now, -18),
      artifactHash: quoteCheck.artifactHash!,
      check: quoteCheck,
    }),
    createRelease({
      id: "rel_invoice_console_142",
      manifest: invoiceManifest,
      status: "deployed",
      approvalState: "approved",
      target: "local_and_cloud",
      requestedAt: isoFrom(now, -5_600),
      approvedAt: isoFrom(now, -5_540),
      artifactHash: invoiceCheck.artifactHash!,
      check: invoiceCheck,
    }),
    createRelease({
      id: "rel_lead_desk_099",
      manifest: leadManifest,
      status: "approved",
      approvalState: "approved",
      target: "cloud",
      requestedAt: isoFrom(now, -1_350),
      approvedAt: isoFrom(now, -1_310),
      artifactHash: leadCheck.artifactHash!,
      check: leadCheck,
    }),
    createRelease({
      id: "rel_support_router_030",
      manifest: supportManifest,
      status: "pending_review",
      approvalState: "pending",
      target: "local",
      requestedAt: isoFrom(now, -245),
      artifactHash: supportCheck.artifactHash!,
      check: supportCheck,
    }),
    createRelease({
      id: "rel_inventory_sync_016",
      manifest: inventoryManifest,
      status: "blocked",
      approvalState: "rejected",
      target: "cloud",
      requestedAt: isoFrom(now, -3_450),
      artifactHash: inventoryCheck.artifactHash ?? "sha256:blocked",
      check: inventoryCheck,
    }),
  ];

  const deployments: WorkspaceAppDeployment[] = [
    createDeployment({
      id: "dep_quote_router_009_local",
      appId: quoteManifest.id,
      releaseId: "rel_quote_router_009",
      target: "local",
      endpoint: "basichome://apps/quote-router",
      deployedAt: isoFrom(now, -7_235),
    }),
    createDeployment({
      id: "dep_quote_router_009_cloud",
      appId: quoteManifest.id,
      releaseId: "rel_quote_router_009",
      target: "cloud",
      endpoint: "https://apps.basichome.local/quote-router",
      deployedAt: isoFrom(now, -7_220),
    }),
    createDeployment({
      id: "dep_invoice_console_142_local",
      appId: invoiceManifest.id,
      releaseId: "rel_invoice_console_142",
      target: "local",
      endpoint: "basichome://apps/invoice-console",
      deployedAt: isoFrom(now, -5_535),
    }),
    createDeployment({
      id: "dep_invoice_console_142_cloud",
      appId: invoiceManifest.id,
      releaseId: "rel_invoice_console_142",
      target: "cloud",
      endpoint: "https://apps.basichome.local/invoice-console",
      deployedAt: isoFrom(now, -5_520),
    }),
  ];

  const apps: WorkspaceApp[] = [
    {
      id: quoteManifest.id,
      name: quoteManifest.name,
      description: quoteManifest.description,
      version: "0.0.9",
      status: "pending_review",
      target: "local_and_cloud",
      owner: "Growth Ops",
      updatedAt: isoFrom(now, -18),
      permissions: quoteManifest.permissions.map((permission) => permission.slug),
      health: "warning",
      lastEvent: "CLI bundle 0.1.0 is waiting for admin approval.",
      cliProjectPath: `${DEFAULT_WORKSPACE_PATH}/quote-router`,
      manifest: quoteManifest,
      activeReleaseId: "rel_quote_router_009",
      pendingReleaseId: "rel_quote_router_010",
      deploymentIds: ["dep_quote_router_009_local", "dep_quote_router_009_cloud"],
    },
    {
      id: invoiceManifest.id,
      name: invoiceManifest.name,
      description: invoiceManifest.description,
      version: invoiceManifest.version,
      status: "installed",
      target: "local_and_cloud",
      owner: "Finance Ops",
      updatedAt: isoFrom(now, -44),
      permissions: invoiceManifest.permissions.map((permission) => permission.slug),
      health: "healthy",
      lastEvent: "Worker checked in 6 minutes ago.",
      cliProjectPath: `${DEFAULT_WORKSPACE_PATH}/invoice-console`,
      manifest: invoiceManifest,
      activeReleaseId: "rel_invoice_console_142",
      deploymentIds: ["dep_invoice_console_142_local", "dep_invoice_console_142_cloud"],
    },
    {
      id: leadManifest.id,
      name: leadManifest.name,
      description: leadManifest.description,
      version: "0.9.8",
      status: "update_available",
      target: "cloud",
      owner: "Growth",
      updatedAt: isoFrom(now, -1_310),
      permissions: leadManifest.permissions.map((permission) => permission.slug),
      health: "warning",
      lastEvent: "Release 0.9.9 passed review and is ready to deploy.",
      cliProjectPath: `${DEFAULT_WORKSPACE_PATH}/lead-research-desk`,
      manifest: leadManifest,
      activeReleaseId: undefined,
      pendingReleaseId: "rel_lead_desk_099",
      deploymentIds: [],
    },
    {
      id: supportManifest.id,
      name: supportManifest.name,
      description: supportManifest.description,
      version: supportManifest.version,
      status: "pending_review",
      target: "local",
      owner: "Support",
      updatedAt: isoFrom(now, -245),
      permissions: supportManifest.permissions.map((permission) => permission.slug),
      health: "warning",
      lastEvent: "Release candidate uploaded from CLI.",
      cliProjectPath: `${DEFAULT_WORKSPACE_PATH}/support-router`,
      manifest: supportManifest,
      pendingReleaseId: "rel_support_router_030",
      deploymentIds: [],
    },
    {
      id: inventoryManifest.id,
      name: inventoryManifest.name,
      description: inventoryManifest.description,
      version: inventoryManifest.version,
      status: "blocked",
      target: "cloud",
      owner: "Operations",
      updatedAt: isoFrom(now, -3_450),
      permissions: inventoryManifest.permissions.map((permission) => permission.slug),
      health: "blocked",
      lastEvent: "Backend service code exists but the manifest omits the service unit.",
      cliProjectPath: `${DEFAULT_WORKSPACE_PATH}/inventory-sync`,
      manifest: inventoryManifest,
      pendingReleaseId: "rel_inventory_sync_016",
      deploymentIds: [],
    },
  ];

  const logs: WorkspaceAppLogEvent[] = [
    createLog({
      id: "log_quote_review_requested",
      type: "review_requested",
      message: "Quote Router 0.1.0 published from CLI and queued for admin review.",
      appId: quoteManifest.id,
      releaseId: "rel_quote_router_010",
      runtime: "basichome_cli",
      target: "local_and_cloud",
      createdAt: isoFrom(now, -18),
      payload: { command: "basics app publish", artifact_hash: quoteCheck.artifactHash },
    }),
    createLog({
      id: "log_invoice_worker_heartbeat",
      type: "worker_heartbeat",
      message: "Invoice Console worker reported ready on local and cloud targets.",
      appId: invoiceManifest.id,
      releaseId: "rel_invoice_console_142",
      deploymentId: "dep_invoice_console_142_cloud",
      runtime: "basics_cloud_worker",
      target: "cloud",
      createdAt: isoFrom(now, -6),
      payload: { worker: "invoice-reconcile", queue: "invoice-review" },
    }),
    createLog({
      id: "log_inventory_check_failed",
      type: "check_failed",
      message: "Deployment check failed closed because backend code was not declared in basics.app.json.",
      appId: inventoryManifest.id,
      releaseId: "rel_inventory_sync_016",
      runtime: "basichome_cli",
      target: "cloud",
      createdAt: isoFrom(now, -3_450),
      payload: { blocker: "service code exists without manifest service unit" },
    }),
  ];

  return {
    schemaVersion: 1,
    apps,
    releases,
    deployments,
    logs: logs.sort(sortLogsDesc),
    selectedAppId: quoteManifest.id,
  };
}

export function readWorkspaceAppsStore(): WorkspaceAppsStore {
  if (typeof window === "undefined") {
    return createInitialWorkspaceAppsStore();
  }

  const stored = window.localStorage.getItem(BASICHOME_WORKSPACE_APPS_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<WorkspaceAppsStore>;
      if (parsed.schemaVersion === 1 && Array.isArray(parsed.apps) && Array.isArray(parsed.releases)) {
        const repaired = repairFutureWorkspaceAppDates(withSeedDefaults({
          schemaVersion: 1,
          apps: parsed.apps as WorkspaceApp[],
          releases: parsed.releases as WorkspaceAppRelease[],
          deployments: Array.isArray(parsed.deployments) ? (parsed.deployments as WorkspaceAppDeployment[]) : [],
          logs: Array.isArray(parsed.logs) ? (parsed.logs as WorkspaceAppLogEvent[]) : [],
          selectedAppId: parsed.selectedAppId,
        }));
        writeWorkspaceAppsStore(repaired);
        return repaired;
      }
    } catch {
      window.localStorage.removeItem(BASICHOME_WORKSPACE_APPS_STORAGE_KEY);
    }
  }

  const seeded = createInitialWorkspaceAppsStore();
  writeWorkspaceAppsStore(seeded);
  return seeded;
}

export function writeWorkspaceAppsStore(store: WorkspaceAppsStore): WorkspaceAppsStore {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(BASICHOME_WORKSPACE_APPS_STORAGE_KEY, JSON.stringify(store));
  }
  return store;
}

export function listWorkspaceAppLogs(store: WorkspaceAppsStore): WorkspaceAppLogEvent[] {
  return store.logs.slice().sort(sortLogsDesc);
}

export function selectPendingRelease(store: WorkspaceAppsStore, appId: string): WorkspaceAppRelease | undefined {
  const app = store.apps.find((candidate) => candidate.id === appId);
  return app?.pendingReleaseId ? store.releases.find((release) => release.id === app.pendingReleaseId) : undefined;
}

export function selectActiveRelease(store: WorkspaceAppsStore, appId: string): WorkspaceAppRelease | undefined {
  const app = store.apps.find((candidate) => candidate.id === appId);
  return app?.activeReleaseId ? store.releases.find((release) => release.id === app.activeReleaseId) : undefined;
}

export function selectDeploymentsForApp(store: WorkspaceAppsStore, appId: string): WorkspaceAppDeployment[] {
  return store.deployments.filter((deployment) => deployment.appId === appId).sort((a, b) => b.deployedAt.localeCompare(a.deployedAt));
}

export function selectLatestRelease(store: WorkspaceAppsStore, appId: string): WorkspaceAppRelease | undefined {
  const app = store.apps.find((candidate) => candidate.id === appId);
  if (!app) return undefined;
  const release = selectPendingRelease(store, appId) ?? selectActiveRelease(store, appId);
  return release ?? store.releases.find((candidate) => candidate.appId === appId);
}

export function selectWorkspaceApp(store: WorkspaceAppsStore, appId: string | undefined): WorkspaceApp | undefined {
  if (appId) return store.apps.find((app) => app.id === appId);
  return store.apps[0];
}

export function publishCliSampleRelease(store: WorkspaceAppsStore): WorkspaceAppsStore {
  const now = new Date().toISOString();
  const manifest = createQuoteRouterManifest("0.1.1");
  const check = runAppDeploymentCheck(manifest, {
    filePaths: fullStackInventory(manifest),
    artifactHash: "sha256:0dd22a471c1d5ce7d26a63681ae42e191e95fd7df411e3aca4b5e9ce2363e4b2",
  });
  const release = createRelease({
    id: `rel_quote_router_011_${Date.now().toString(36)}`,
    manifest,
    status: "pending_review",
    approvalState: "pending",
    target: "local_and_cloud",
    requestedAt: now,
    artifactHash: check.artifactHash!,
    check,
  });
  const app = store.apps.find((candidate) => candidate.id === manifest.id);
  const nextApps = app
    ? store.apps.map((candidate) =>
        candidate.id === manifest.id
          ? {
              ...candidate,
              version: candidate.version,
              status: "pending_review" as const,
              health: "warning" as const,
              updatedAt: now,
              manifest,
              pendingReleaseId: release.id,
              lastEvent: "CLI bundle 0.1.1 is waiting for admin approval.",
            }
          : candidate,
      )
    : [
        ...store.apps,
        {
          id: manifest.id,
          name: manifest.name,
          description: manifest.description,
          version: manifest.version,
          status: "pending_review" as const,
          target: "local_and_cloud" as const,
          owner: "Growth Ops",
          updatedAt: now,
          permissions: manifest.permissions.map((permission) => permission.slug),
          health: "warning" as const,
          lastEvent: "CLI bundle 0.1.1 is waiting for admin approval.",
          cliProjectPath: `${DEFAULT_WORKSPACE_PATH}/quote-router`,
          manifest,
          pendingReleaseId: release.id,
          deploymentIds: [],
        },
      ];

  return {
    ...store,
    apps: nextApps,
    releases: [release, ...store.releases.filter((candidate) => candidate.id !== release.id)],
    logs: [
      createLog({
        id: `log_cli_publish_${Date.now().toString(36)}`,
        type: "review_requested",
        message: "Quote Router 0.1.1 published from CLI and queued for admin review.",
        appId: manifest.id,
        releaseId: release.id,
        runtime: "basichome_cli",
        target: "local_and_cloud",
        createdAt: now,
        payload: { command: "basics app publish", artifact_hash: release.artifactHash },
      }),
      ...store.logs,
    ].sort(sortLogsDesc),
    selectedAppId: manifest.id,
  };
}

export function approveWorkspaceAppRelease(store: WorkspaceAppsStore, releaseId: string): WorkspaceAppsStore {
  const now = new Date().toISOString();
  const release = store.releases.find((candidate) => candidate.id === releaseId);
  if (!release || !release.scanResult.ok) return store;

  return {
    ...store,
    releases: store.releases.map((candidate) =>
      candidate.id === releaseId
        ? {
            ...candidate,
            status: "approved" as const,
            approvalState: "approved" as const,
            approvedBy: "workspace-admin",
            approvedAt: now,
          }
        : candidate,
    ),
    apps: store.apps.map((app) =>
      app.id === release.appId
        ? {
            ...app,
            status: "update_available" as const,
            health: "warning" as const,
            updatedAt: now,
            lastEvent: `Release ${release.version} approved and ready to deploy.`,
          }
        : app,
    ),
    logs: [
      createLog({
        id: `log_approval_${releaseId}_${Date.now().toString(36)}`,
        type: "approval_granted",
        message: `${release.manifest.name} ${release.version} approved by workspace admin.`,
        appId: release.appId,
        releaseId,
        runtime: "admin_review",
        target: release.target,
        createdAt: now,
        payload: { approval_state: "approved", scan_ok: release.scanResult.ok },
      }),
      ...store.logs,
    ].sort(sortLogsDesc),
  };
}

export function deployWorkspaceAppRelease(store: WorkspaceAppsStore, releaseId: string): WorkspaceAppsStore {
  const now = new Date().toISOString();
  const release = store.releases.find((candidate) => candidate.id === releaseId);
  if (!release || release.approvalState !== "approved" || !release.scanResult.ok) return store;

  const targets = release.target === "local_and_cloud" ? ["local", "cloud"] as const : [release.target] as const;
  const deployments = targets.map((target) =>
    createDeployment({
      id: `dep_${release.appId}_${release.version.replace(/\W/g, "_")}_${target}_${Date.now().toString(36)}`,
      appId: release.appId,
      releaseId,
      target,
      endpoint: target === "local" ? `basichome://apps/${release.appId.replace(/^app_/, "").replace(/_/g, "-")}` : `https://apps.basichome.local/${release.appId.replace(/^app_/, "").replace(/_/g, "-")}`,
      deployedAt: now,
    }),
  );

  return {
    ...store,
    releases: store.releases.map((candidate) =>
      candidate.id === releaseId
        ? {
            ...candidate,
            status: "deployed" as const,
          }
        : candidate,
    ),
    deployments: [...deployments, ...store.deployments],
    apps: store.apps.map((app) =>
      app.id === release.appId
        ? {
            ...app,
            version: release.version,
            status: "installed" as const,
            health: "healthy" as const,
            updatedAt: now,
            activeReleaseId: releaseId,
            pendingReleaseId: undefined,
            deploymentIds: [...deployments.map((deployment) => deployment.id), ...app.deploymentIds],
            lastEvent: `Release ${release.version} deployed to ${targetLabel(release.target)}.`,
          }
        : app,
    ),
    logs: [
      createLog({
        id: `log_deploy_start_${releaseId}_${Date.now().toString(36)}`,
        type: "deployment_started",
        message: `${release.manifest.name} ${release.version} deployment started after admin approval.`,
        appId: release.appId,
        releaseId,
        runtime: "basichome_cli",
        target: release.target,
        createdAt: now,
        payload: { targets },
      }),
      createLog({
        id: `log_deploy_done_${releaseId}_${Date.now().toString(36)}`,
        type: "deployment_completed",
        message: `${release.manifest.name} ${release.version} is active on ${targetLabel(release.target)}.`,
        appId: release.appId,
        releaseId,
        deploymentId: deployments[0]?.id,
        runtime: release.target === "local" ? "local_app_runtime" : "basics_cloud_worker",
        target: release.target,
        createdAt: now,
        payload: { artifact_hash: release.artifactHash, endpoints: deployments.map((deployment) => deployment.endpoint) },
      }),
      ...store.logs,
    ].sort(sortLogsDesc),
  };
}

export function rollbackWorkspaceApp(store: WorkspaceAppsStore, appId: string): WorkspaceAppsStore {
  const now = new Date().toISOString();
  const app = store.apps.find((candidate) => candidate.id === appId);
  if (!app?.activeReleaseId) return store;
  const activeRelease = store.releases.find((release) => release.id === app.activeReleaseId);
  const previousRelease = store.releases.find(
    (release) => release.appId === appId && release.id !== app.activeReleaseId && release.status === "deployed",
  );
  if (!activeRelease || !previousRelease) return store;

  return {
    ...store,
    releases: store.releases.map((release) => {
      if (release.id === activeRelease.id) return { ...release, status: "rolled_back" as const };
      if (release.id === previousRelease.id) return { ...release, status: "deployed" as const };
      return release;
    }),
    deployments: store.deployments.map((deployment) =>
      deployment.releaseId === activeRelease.id
        ? { ...deployment, status: "rolled_back" as const, rolledBackAt: now }
        : deployment.releaseId === previousRelease.id
          ? { ...deployment, status: "active" as const }
          : deployment,
    ),
    apps: store.apps.map((candidate) =>
      candidate.id === appId
        ? {
            ...candidate,
            version: previousRelease.version,
            activeReleaseId: previousRelease.id,
            status: "installed" as const,
            health: "healthy" as const,
            updatedAt: now,
            lastEvent: `Rolled back to ${previousRelease.version}.`,
          }
        : candidate,
    ),
    logs: [
      createLog({
        id: `log_rollback_${appId}_${Date.now().toString(36)}`,
        type: "rollback_completed",
        message: `${app.name} rolled back from ${activeRelease.version} to ${previousRelease.version}.`,
        appId,
        releaseId: previousRelease.id,
        runtime: "admin_review",
        target: app.target,
        createdAt: now,
        payload: { from: activeRelease.version, to: previousRelease.version },
      }),
      ...store.logs,
    ].sort(sortLogsDesc),
  };
}

export function selectAppDeploymentCheck(store: WorkspaceAppsStore, appId: string): AppDeploymentCheck | undefined {
  return selectLatestRelease(store, appId)?.scanResult;
}

export function runAppDeploymentCheck(manifest: BasicsAppManifest, input: DeploymentCheckInput = {}): AppDeploymentCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const scanFindings: AppDeploymentCheck["scanFindings"] = [];
  const filePaths = input.filePaths?.map(normalizePath) ?? [];
  const fileContents = input.fileContents ?? {};
  const discoveredKinds = new Set(filePaths.map(discoverKindFromPath).filter((kind): kind is AppUnitKind => Boolean(kind)));
  const declaredKinds = new Set(manifest.units.map((unit) => unit.kind));

  validateManifestShape(manifest, errors);
  validateUnits(manifest.units, errors, warnings);
  validateReferences(manifest, errors);

  for (const kind of discoveredKinds) {
    if (!declaredKinds.has(kind)) {
      errors.push(`${kind} code exists in the project but no ${kind} unit is declared in basics.app.json.`);
    }
  }

  if (filePaths.length > 0) {
    for (const unit of manifest.units) {
      const normalizedUnitPath = normalizePath(unit.path);
      const found = filePaths.some((candidate) => candidate === normalizedUnitPath || candidate.startsWith(`${normalizedUnitPath}/`) || normalizedUnitPath.startsWith(`${candidate}/`));
      if (!found) {
        errors.push(`Declared ${unit.kind} unit "${unit.name}" points to ${unit.path}, but no matching file was found.`);
      }
    }
  }

  for (const [path, content] of Object.entries(fileContents)) {
    if (/-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(content) || /sk-[a-zA-Z0-9]{20,}/.test(content)) {
      scanFindings.push({ severity: "blocker", message: "Potential secret detected in app source.", path });
    }
    if (/\beval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content)) {
      scanFindings.push({ severity: "blocker", message: "Dynamic code execution is blocked for private app bundles.", path });
    }
    if (/from ["']node:child_process["']|require\(["']child_process["']\)/.test(content)) {
      scanFindings.push({ severity: "blocker", message: "child_process access is blocked in basichome app bundles.", path });
    }
    if (/https?:\/\/(?!(localhost|127\.0\.0\.1|apps\.basichome\.local|basichome\.dev))/.test(content)) {
      scanFindings.push({ severity: "warning", message: "External network endpoint found; admin should verify this permission.", path });
    }
  }

  for (const finding of scanFindings) {
    if (finding.severity === "blocker") errors.push(finding.path ? `${finding.message} (${finding.path})` : finding.message);
    if (finding.severity === "warning") warnings.push(finding.path ? `${finding.message} (${finding.path})` : finding.message);
  }

  const ok = errors.length === 0;
  return {
    ok,
    summary: ok
      ? "Manifest, full-stack units, permissions, routes, schedules, queues, and scan checks passed."
      : "Deployment check failed closed. Fix manifest coverage or scan blockers before publishing.",
    errors,
    warnings,
    manifestUnits: manifest.units.length,
    discoveredUnits: discoveredKinds.size,
    artifactHash: input.artifactHash,
    scanFindings,
  };
}

function validateManifestShape(manifest: BasicsAppManifest, errors: string[]): void {
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  for (const field of ["id", "name", "version", "description"] as const) {
    if (!manifest[field]?.trim()) errors.push(`${field} is required.`);
  }
  if (!/^app_[a-z0-9_]+$/.test(manifest.id)) errors.push("id must use app_snake_case format.");
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) errors.push("At least one deployment target is required.");
  for (const target of manifest.targets) {
    if (target !== "local" && target !== "cloud") errors.push(`Unsupported deployment target "${target}".`);
  }
  if (!Array.isArray(manifest.units) || manifest.units.length === 0) errors.push("At least one app unit is required.");
  if (!manifest.units.some((unit) => unit.kind === "ui")) errors.push("A UI unit is required so the app can appear in basichome.");
  if (!Array.isArray(manifest.permissions)) errors.push("permissions must be an array.");
  if (!Array.isArray(manifest.secrets)) errors.push("secrets must be an array.");
  if (!Array.isArray(manifest.routes)) errors.push("routes must be an array.");
  if (!Array.isArray(manifest.schedules)) errors.push("schedules must be an array.");
  if (!Array.isArray(manifest.queues)) errors.push("queues must be an array.");
}

function validateUnits(units: BasicsAppManifestUnit[], errors: string[], warnings: string[]): void {
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const unit of units) {
    if (names.has(unit.name)) errors.push(`Duplicate unit name "${unit.name}".`);
    if (paths.has(unit.path)) errors.push(`Duplicate unit path "${unit.path}".`);
    names.add(unit.name);
    paths.add(unit.path);
    if (!unit.name?.trim()) errors.push("Each unit needs a name.");
    if (!unit.path?.trim()) errors.push(`Unit ${unit.name || "unknown"} needs a path.`);
    if (unit.kind === "ui" && unit.runtime !== "browser") errors.push(`UI unit "${unit.name}" must use browser runtime.`);
    if ((unit.kind === "service" || unit.kind === "worker") && unit.runtime !== "node22") errors.push(`${unit.kind} unit "${unit.name}" must use node22 runtime.`);
    if (unit.kind === "migration" && unit.runtime !== "sql") errors.push(`Migration unit "${unit.name}" must use sql runtime.`);
    if (unit.kind === "worker" && !unit.queue && !unit.schedule) warnings.push(`Worker unit "${unit.name}" has no queue or schedule.`);
  }
}

function validateReferences(manifest: BasicsAppManifest, errors: string[]): void {
  const unitNames = new Set(manifest.units.map((unit) => unit.name));
  for (const route of manifest.routes) {
    if (!unitNames.has(route.unit)) errors.push(`Route ${route.source} references missing unit "${route.unit}".`);
  }
  for (const schedule of manifest.schedules) {
    if (!unitNames.has(schedule.unit)) errors.push(`Schedule ${schedule.id} references missing unit "${schedule.unit}".`);
  }
  for (const queue of manifest.queues) {
    if (!unitNames.has(queue.unit)) errors.push(`Queue ${queue.name} references missing unit "${queue.unit}".`);
    if (queue.concurrency < 1) errors.push(`Queue ${queue.name} concurrency must be at least 1.`);
  }
  for (const permission of manifest.permissions) {
    if (!permission.slug || !permission.reason) errors.push("Every permission needs a slug and reason.");
  }
  for (const secret of manifest.secrets) {
    if (!/^[A-Z0-9_]+$/.test(secret.name)) errors.push(`Secret ${secret.name} must use uppercase env-var format.`);
  }
}

function withSeedDefaults(store: WorkspaceAppsStore): WorkspaceAppsStore {
  const seeded = createInitialWorkspaceAppsStore();
  const appIds = new Set(store.apps.map((app) => app.id));
  const releaseIds = new Set(store.releases.map((release) => release.id));
  const deploymentIds = new Set(store.deployments.map((deployment) => deployment.id));
  const logIds = new Set(store.logs.map((log) => log.id));
  return {
    ...store,
    apps: [...store.apps, ...seeded.apps.filter((app) => !appIds.has(app.id))],
    releases: [...store.releases, ...seeded.releases.filter((release) => !releaseIds.has(release.id))],
    deployments: [...store.deployments, ...seeded.deployments.filter((deployment) => !deploymentIds.has(deployment.id))],
    logs: [...store.logs, ...seeded.logs.filter((log) => !logIds.has(log.id))].sort(sortLogsDesc),
    selectedAppId: store.selectedAppId ?? seeded.selectedAppId,
  };
}

function createRelease({
  id,
  manifest,
  status,
  approvalState,
  target,
  requestedAt,
  approvedAt,
  artifactHash,
  check,
}: {
  id: string;
  manifest: BasicsAppManifest;
  status: WorkspaceAppRelease["status"];
  approvalState: WorkspaceAppRelease["approvalState"];
  target: WorkspaceAppRelease["target"];
  requestedAt: string;
  approvedAt?: string;
  artifactHash: string;
  check: AppDeploymentCheck;
}): WorkspaceAppRelease {
  return {
    id,
    appId: manifest.id,
    version: manifest.version,
    status,
    approvalState,
    target,
    requestedBy: "basichome-cli",
    requestedAt,
    approvedBy: approvedAt ? "workspace-admin" : undefined,
    approvedAt,
    bundlePath: `${DEFAULT_WORKSPACE_PATH}/${manifest.id.replace(/^app_/, "").replace(/_/g, "-")}/dist/${manifest.id}-${manifest.version}.basics`,
    artifactHash,
    scanResult: check,
    manifest,
  };
}

function createDeployment({
  id,
  appId,
  releaseId,
  target,
  endpoint,
  deployedAt,
}: {
  id: string;
  appId: string;
  releaseId: string;
  target: AppDeploymentTarget;
  endpoint: string;
  deployedAt: string;
}): WorkspaceAppDeployment {
  return {
    id,
    appId,
    releaseId,
    target,
    status: "active",
    endpoint,
    serviceStatus: "ready",
    workerStatus: "ready",
    migrationStatus: "applied",
    deployedAt,
  };
}

function createLog({
  id,
  type,
  message,
  appId,
  releaseId,
  deploymentId,
  runtime,
  target,
  createdAt,
  payload,
}: Omit<WorkspaceAppLogEvent, "actorAccountId" | "deviceId" | "source">): WorkspaceAppLogEvent {
  return {
    id,
    type,
    message,
    appId,
    releaseId,
    deploymentId,
    actorAccountId: DEFAULT_ACTOR_ACCOUNT_ID,
    deviceId: DEFAULT_DEVICE_ID,
    target,
    runtime,
    source: "workspace_app_registry",
    createdAt,
    payload,
  };
}

function createQuoteRouterManifest(version: string): BasicsAppManifest {
  return {
    schemaVersion: 1,
    id: "app_quote_router",
    name: "Quote Router",
    version,
    description: "Private quoting tool with a dashboard, Node service, background enrichment worker, and migration.",
    targets: ["local", "cloud"],
    units: [
      { kind: "ui", name: "dashboard", path: "apps/dashboard/index.html", runtime: "browser", route: "/apps/quote-router" },
      { kind: "service", name: "api", path: "services/api/src/index.ts", runtime: "node22", route: "/api/quote-router" },
      { kind: "worker", name: "lead-enrichment", path: "workers/lead-enrichment/src/index.ts", runtime: "node22", queue: "quote-leads" },
      { kind: "migration", name: "schema", path: "migrations/0001_quote_router.sql", runtime: "sql" },
    ],
    permissions: [
      { slug: "crm.read", reason: "Read lead records before quote drafting.", risk: "read" },
      { slug: "gmail.draft", reason: "Draft follow-up emails for approved quotes.", risk: "write" },
      { slug: "runtime.logs", reason: "Write deployment and worker logs into the workspace audit stream.", risk: "read" },
    ],
    secrets: [
      { name: "CRM_API_TOKEN", scope: "device", required: true },
      { name: "GMAIL_CONNECTOR_ID", scope: "workspace", required: true },
    ],
    routes: [
      { source: "/quote-router", unit: "dashboard" },
      { source: "/api/quote-router", unit: "api" },
    ],
    schedules: [
      { id: "quote-followup-digest", unit: "lead-enrichment", cron: "0 17 * * 1-5", timezone: "America/Los_Angeles" },
    ],
    queues: [
      { name: "quote-leads", unit: "lead-enrichment", concurrency: 2 },
    ],
  };
}

function createInvoiceManifest(version: string): BasicsAppManifest {
  return {
    ...createQuoteRouterManifest(version),
    id: "app_invoice_console",
    name: "Invoice Console",
    description: "Ops tool for reviewing invoice chases, approved drafts, and payment exceptions.",
    permissions: [
      { slug: "quickbooks.read", reason: "Read invoice status.", risk: "read" },
      { slug: "gmail.draft", reason: "Draft billing reminders.", risk: "write" },
      { slug: "runtime.logs", reason: "Write worker health logs.", risk: "read" },
    ],
  };
}

function createLeadDeskManifest(version: string): BasicsAppManifest {
  return {
    ...createQuoteRouterManifest(version),
    id: "app_lead_research",
    name: "Lead Research Desk",
    description: "Internal app for enriching target accounts and reviewing browser-agent findings.",
    targets: ["cloud"],
    permissions: [
      { slug: "hubspot.write", reason: "Update enriched lead fields after approval.", risk: "write" },
      { slug: "browser.local", reason: "Reference saved local browser session metadata.", risk: "read" },
      { slug: "browser.cloud", reason: "Run long lead research jobs in Basics Cloud.", risk: "write" },
    ],
  };
}

function createSupportRouterManifest(version: string): BasicsAppManifest {
  return {
    ...createQuoteRouterManifest(version),
    id: "app_support_router",
    name: "Support Router",
    description: "Classifies urgent Zendesk tickets and gives support leads a compact triage surface.",
    targets: ["local"],
    permissions: [
      { slug: "zendesk.read", reason: "Read support tickets.", risk: "read" },
      { slug: "slack.post", reason: "Post urgent handoff messages after approval.", risk: "write" },
    ],
  };
}

function createInventoryManifest(version: string): BasicsAppManifest {
  const manifest: BasicsAppManifest = {
    ...createQuoteRouterManifest(version),
    id: "app_inventory_sync",
    name: "Inventory Sync",
    description: "Compares Shopify inventory against warehouse exports before the automation writes changes.",
    targets: ["cloud"],
    permissions: [
      { slug: "shopify.read", reason: "Read inventory counts.", risk: "read" },
      { slug: "s3.read", reason: "Read warehouse exports.", risk: "read" },
      { slug: "sheets.write", reason: "Write reviewed sync output.", risk: "write" },
    ],
  };
  return {
    ...manifest,
    units: manifest.units.filter((unit) => unit.kind !== "service"),
  };
}

function fullStackInventory(manifest: BasicsAppManifest): string[] {
  return manifest.units.map((unit) => unit.path);
}

function discoverKindFromPath(path: string): AppUnitKind | undefined {
  if (/^(apps|ui)\//.test(path)) return "ui";
  if (/^(services|service)\//.test(path)) return "service";
  if (/^(workers|worker)\//.test(path)) return "worker";
  if (/^migrations\//.test(path)) return "migration";
  return undefined;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function sortLogsDesc(a: WorkspaceAppLogEvent, b: WorkspaceAppLogEvent): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function isoFrom(nowMs: number, minutesAgo: number): string {
  return new Date(nowMs + minutesAgo * 60_000).toISOString();
}

function repairFutureWorkspaceAppDates(store: WorkspaceAppsStore): WorkspaceAppsStore {
  const now = Date.now();
  const clamp = (value: string | undefined) => {
    if (!value) return value;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time > now + 60_000 ? new Date(now).toISOString() : value;
  };

  return {
    ...store,
    apps: store.apps.map((app) => ({ ...app, updatedAt: clamp(app.updatedAt)! })),
    releases: store.releases.map((release) => ({
      ...release,
      requestedAt: clamp(release.requestedAt)!,
      approvedAt: clamp(release.approvedAt),
    })),
    deployments: store.deployments.map((deployment) => ({
      ...deployment,
      deployedAt: clamp(deployment.deployedAt)!,
      rolledBackAt: clamp(deployment.rolledBackAt),
    })),
    logs: store.logs.map((log) => ({ ...log, createdAt: clamp(log.createdAt)! })).sort(sortLogsDesc),
  };
}

function targetLabel(target: WorkspaceAppRelease["target"]): string {
  if (target === "local_and_cloud") return "local and cloud";
  return target;
}
