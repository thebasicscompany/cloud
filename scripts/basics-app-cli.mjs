#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

const REGISTRY_DIR = ".basichome";
const REGISTRY_FILE = "app-registry.json";
const MANIFEST_FILE = "basics.app.json";
const BUNDLE_KIND = "basichome.app.bundle.v1";
const BLOCKED_DIRS = new Set(["node_modules", "dist", ".git", ".basichome"]);

const nowIso = () => new Date().toISOString();

async function main() {
  const rawArgs = process.argv.slice(2);
  const group = rawArgs[0];
  const args =
    group === "app"
      ? rawArgs.slice(1)
      : group === "approvals" || group === "trust"
        ? rawArgs
        : rawArgs;
  const command = args[0];

  try {
    if (!command || command === "help" || command === "--help") {
      printHelp();
      return;
    }
    if (command === "approvals") await dispatchApprovalCommand(args.slice(1));
    else if (command === "trust") await dispatchTrustCommand(args.slice(1));
    else if (command === "init") await commandInit(args.slice(1));
    else if (command === "check") await commandCheck(args.slice(1));
    else if (command === "build") await commandBuild(args.slice(1));
    else if (command === "install") await commandInstall(args.slice(1));
    else if (command === "publish") await commandPublish(args.slice(1));
    else if (command === "request-review") await commandRequestReview(args.slice(1));
    else if (command === "approve") await commandApprove(args.slice(1));
    else if (command === "deploy") await commandDeploy(args.slice(1));
    else if (command === "rollback") await commandRollback(args.slice(1));
    else if (command === "logs") await commandLogs(args.slice(1));
    else throw new Error(`Unknown command "${command}".`);
  } catch (error) {
    console.error(`basics ${command ?? ""}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

async function commandInit(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options._[0] ?? "basichome-private-app");
  const name = options.name ?? titleCase(path.basename(projectDir));
  const slug = slugify(name);
  const appId = `app_${slug.replace(/-/g, "_")}`;
  const force = Boolean(options.force);

  if (existsSync(projectDir) && !force) {
    const existing = await fs.readdir(projectDir).catch(() => []);
    if (existing.length > 0) throw new Error(`${projectDir} already exists. Re-run with --force to add missing files.`);
  }

  const manifest = createSampleManifest({ appId, name, slug });
  await writeFileIfAbsent(path.join(projectDir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, force);
  await writeFileIfAbsent(path.join(projectDir, "package.json"), `${JSON.stringify(createPackageJson(slug), null, 2)}\n`, force);
  await writeFileIfAbsent(path.join(projectDir, "apps/dashboard/index.html"), sampleHtml(name), force);
  await writeFileIfAbsent(path.join(projectDir, "apps/dashboard/src/main.ts"), sampleUiSource(name), force);
  await writeFileIfAbsent(path.join(projectDir, "services/api/src/index.ts"), sampleServiceSource(), force);
  await writeFileIfAbsent(path.join(projectDir, "workers/lead-enrichment/src/index.ts"), sampleWorkerSource(), force);
  await writeFileIfAbsent(path.join(projectDir, "migrations/0001_quote_router.sql"), sampleMigration(), force);
  await writeFileIfAbsent(path.join(projectDir, "tests/smoke.test.ts"), sampleTest(), force);

  const registry = await readRegistry(projectDir);
  registry.logs.unshift(createLog({
    type: "cli_init",
    message: `${name} initialized with UI, service, worker, and migration units.`,
    appId,
    runtime: "basichome_cli",
    target: "local",
    payload: { project_dir: projectDir },
  }));
  await writeRegistry(projectDir, registry);

  console.log(`Created ${name} at ${projectDir}`);
  console.log(`Next: basics app check ${projectDir}`);
}

async function commandCheck(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options._[0] ?? process.cwd());
  const { manifest, filePaths, fileContents } = await loadProjectForCheck(projectDir);
  const check = runAppDeploymentCheck(manifest, { filePaths, fileContents });
  printCheck(check);
  if (!check.ok) process.exitCode = 1;
}

async function commandBuild(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options._[0] ?? process.cwd());
  const { manifest, filePaths, fileContents } = await loadProjectForCheck(projectDir);
  const check = runAppDeploymentCheck(manifest, { filePaths, fileContents });
  if (!check.ok) {
    printCheck(check);
    throw new Error("deployment check failed; bundle was not built.");
  }

  const files = await collectBundleFiles(projectDir);
  const artifactHash = hashJson({
    manifest,
    files: files.map((file) => ({ path: file.path, sha256: file.sha256 })),
  });
  const checked = { ...check, artifactHash: `sha256:${artifactHash}` };
  const bundle = {
    kind: BUNDLE_KIND,
    builtAt: nowIso(),
    manifest,
    check: checked,
    files,
  };

  const distDir = path.join(projectDir, "dist");
  await fs.mkdir(distDir, { recursive: true });
  const bundlePath = path.join(distDir, `${manifest.id}-${manifest.version}.basics`);
  await fs.writeFile(bundlePath, gzipSync(Buffer.from(JSON.stringify(bundle, null, 2))));

  const registry = await readRegistry(projectDir);
  registry.logs.unshift(createLog({
    type: "bundle_built",
    message: `${manifest.name} ${manifest.version} bundle built.`,
    appId: manifest.id,
    runtime: "basichome_cli",
    target: manifest.targets.join("+"),
    payload: { bundle_path: bundlePath, artifact_hash: checked.artifactHash },
  }));
  await writeRegistry(projectDir, registry);

  console.log(`Built ${bundlePath}`);
  console.log(`Artifact ${checked.artifactHash}`);
}

async function commandInstall(args) {
  const options = parseOptions(args);
  const bundlePath = path.resolve(options._[0] ?? "");
  if (!bundlePath) throw new Error("Bundle path is required.");
  const projectDir = resolveProjectDirFromBundle(bundlePath);
  const bundle = await readBundle(bundlePath);
  const registry = await readRegistry(projectDir);
  upsertAppFromBundle(registry, bundle, "installed");
  upsertReleaseFromBundle(registry, bundle, "local_installed", "not_required", bundlePath);
  registry.deployments.unshift(createDeployment(bundle.manifest, `rel_${bundle.manifest.id}_${bundle.manifest.version.replace(/\W/g, "_")}`, "local"));
  registry.logs.unshift(createLog({
    type: "local_installed",
    message: `${bundle.manifest.name} ${bundle.manifest.version} installed locally.`,
    appId: bundle.manifest.id,
    releaseId: `rel_${bundle.manifest.id}_${bundle.manifest.version.replace(/\W/g, "_")}`,
    runtime: "local_app_runtime",
    target: "local",
    payload: { bundle_path: bundlePath },
  }));
  await writeRegistry(projectDir, registry);
  console.log(`Installed ${bundle.manifest.name} ${bundle.manifest.version} locally`);
}

async function commandPublish(args) {
  const options = parseOptions(args);
  const bundlePath = path.resolve(options._[0] ?? "");
  if (!bundlePath) throw new Error("Bundle path is required.");
  const projectDir = resolveProjectDirFromBundle(bundlePath);
  const bundle = await readBundle(bundlePath);
  if (!bundle.check.ok) throw new Error("Bundle check is not OK; publish blocked.");
  const registry = await readRegistry(projectDir);
  const releaseId = upsertReleaseFromBundle(registry, bundle, "pending_review", "pending", bundlePath);
  upsertAppFromBundle(registry, bundle, "pending_review", releaseId);
  upsertApprovalFromRelease(registry, releaseId, "pending");
  registry.logs.unshift(createLog({
    type: "review_requested",
    message: `${bundle.manifest.name} ${bundle.manifest.version} published for admin review.`,
    appId: bundle.manifest.id,
    releaseId,
    runtime: "basichome_cli",
    target: targetFromManifest(bundle.manifest),
    payload: { bundle_path: bundlePath, artifact_hash: bundle.check.artifactHash },
  }));
  await writeRegistry(projectDir, registry);
  console.log(`Published ${bundle.manifest.name} ${bundle.manifest.version} for review`);
  console.log(`Release ${releaseId}`);
}

async function commandRequestReview(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options.project ?? process.cwd());
  const releaseId = options._[0];
  if (!releaseId) throw new Error("Release id is required.");
  const registry = await readRegistry(projectDir);
  const release = registry.releases.find((candidate) => candidate.id === releaseId);
  if (!release) throw new Error(`Release ${releaseId} not found.`);
  release.status = "pending_review";
  release.approvalState = "pending";
  upsertApprovalFromRelease(registry, releaseId, "pending");
  registry.logs.unshift(createLog({
    type: "review_requested",
    message: `${release.manifest.name} ${release.version} queued for admin approval.`,
    appId: release.appId,
    releaseId,
    runtime: "basichome_cli",
    target: release.target,
    payload: { artifact_hash: release.artifactHash },
  }));
  await writeRegistry(projectDir, registry);
  console.log(`Review requested for ${releaseId}`);
}

async function commandApprove(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options.project ?? process.cwd());
  const releaseId = options._[0];
  if (!releaseId) throw new Error("Release id is required.");
  const registry = await readRegistry(projectDir);
  approveReleaseInRegistry(registry, releaseId, options.by ?? "workspace-admin");
  await writeRegistry(projectDir, registry);
  console.log(`Approved ${releaseId}`);
}

async function commandDeploy(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options.project ?? process.cwd());
  const releaseId = options._[0];
  if (!releaseId) throw new Error("Release id is required.");
  const registry = await readRegistry(projectDir);
  const release = deployReleaseInRegistry(registry, releaseId);
  await writeRegistry(projectDir, registry);
  console.log(`Deployed ${releaseId} to ${release.target}`);
}

async function commandRollback(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options.project ?? process.cwd());
  const appId = options._[0];
  if (!appId) throw new Error("App id is required.");
  const registry = await readRegistry(projectDir);
  const app = registry.apps.find((candidate) => candidate.id === appId);
  if (!app?.activeReleaseId) throw new Error(`${appId} has no active release.`);
  const active = registry.releases.find((release) => release.id === app.activeReleaseId);
  const previous = registry.releases.find((release) => release.appId === appId && release.id !== app.activeReleaseId && release.status === "deployed");
  if (!active || !previous) throw new Error(`${appId} has no previous deployed release to roll back to.`);
  active.status = "rolled_back";
  app.activeReleaseId = previous.id;
  app.version = previous.version;
  app.status = "installed";
  app.health = "healthy";
  app.lastEvent = `Rolled back to ${previous.version}.`;
  app.updatedAt = nowIso();
  for (const deployment of registry.deployments) {
    if (deployment.releaseId === active.id) {
      deployment.status = "rolled_back";
      deployment.rolledBackAt = nowIso();
    }
  }
  registry.logs.unshift(createLog({
    type: "rollback_completed",
    message: `${app.name} rolled back from ${active.version} to ${previous.version}.`,
    appId,
    releaseId: previous.id,
    runtime: "admin_review",
    target: app.target,
    payload: { from: active.version, to: previous.version },
  }));
  await writeRegistry(projectDir, registry);
  console.log(`Rolled back ${appId} to ${previous.version}`);
}

async function commandLogs(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options.project ?? process.cwd());
  const registry = await readRegistry(projectDir);
  const logs = options._[0]
    ? registry.logs.filter((log) => log.appId === options._[0] || log.releaseId === options._[0])
    : registry.logs;
  for (const log of logs.slice(0, Number(options.limit ?? 20))) {
    console.log(`${log.createdAt} ${log.runtime} ${log.type} ${log.message}`);
  }
}

async function dispatchApprovalCommand(args) {
  const command = args[0];
  const rest = args.slice(1);
  if (!command || command === "help" || command === "--help") {
    printApprovalHelp();
    return;
  }
  if (command === "list") await commandApprovalsList(rest);
  else if (command === "view") await commandApprovalsView(rest);
  else if (command === "approve") await commandApprovalsApprove(rest);
  else if (command === "reject") await commandApprovalsReject(rest);
  else if (command === "request-changes") await commandApprovalsRequestChanges(rest);
  else throw new Error(`Unknown approvals command "${command}".`);
}

async function commandApprovalsList(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options.project ?? process.cwd());
  const registry = await readRegistry(projectDir);
  const status = options.status ?? "all";
  const approvals = registry.approvals
    .filter((approval) => status === "all" || approval.status === status)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  if (approvals.length === 0) {
    console.log("No approvals found.");
    return;
  }

  for (const approval of approvals) {
    console.log([
      approval.id,
      approval.status,
      approval.kind,
      approval.objectName,
      `requires:${approval.requiredRole}`,
      `target:${approval.rolloutTarget}`,
    ].join("\t"));
  }
}

async function commandApprovalsView(args) {
  const options = parseOptions(args);
  const approvalId = options._[0];
  if (!approvalId) throw new Error("Approval id is required.");
  const projectDir = path.resolve(options.project ?? process.cwd());
  const registry = await readRegistry(projectDir);
  const approval = findRegistryApproval(registry, approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} not found.`);
  console.log(JSON.stringify(approval, null, 2));
}

async function commandApprovalsApprove(args) {
  const options = parseOptions(args);
  const approvalId = options._[0];
  if (!approvalId) throw new Error("Approval id is required.");
  const projectDir = path.resolve(options.project ?? process.cwd());
  const registry = await readRegistry(projectDir);
  const approval = findRegistryApproval(registry, approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} not found.`);
  if (!["draft", "pending", "changes_requested"].includes(approval.status)) {
    throw new Error(`Approval ${approvalId} is ${approval.status}; only draft, pending, or changes_requested approvals can be approved.`);
  }
  if (approvalHasFailedChecks(approval)) {
    setRegistryApprovalDecision(registry, approval, "rejected", options.by ?? "workspace-admin", "Approval blocked because one or more checks failed.");
    await writeRegistry(projectDir, registry);
    throw new Error("Approval check failed closed; fix the failed check before approving.");
  }

  if (approval.releaseId && (approval.kind === "app_release" || approval.kind === "app_update")) {
    approveReleaseInRegistry(registry, approval.releaseId, options.by ?? "workspace-admin");
    deployReleaseInRegistry(registry, approval.releaseId);
  } else {
    setRegistryApprovalDecision(registry, approval, "approved", options.by ?? "workspace-admin", options.reason ?? "Approved from the basichome CLI.");
  }
  await writeRegistry(projectDir, registry);
  console.log(`Approved ${approvalId}`);
  if (approval.releaseId) console.log(`Deployed ${approval.releaseId}`);
}

async function commandApprovalsReject(args) {
  const options = parseOptions(args);
  const approvalId = options._[0];
  if (!approvalId) throw new Error("Approval id is required.");
  const projectDir = path.resolve(options.project ?? process.cwd());
  const registry = await readRegistry(projectDir);
  const approval = findRegistryApproval(registry, approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} not found.`);
  setRegistryApprovalDecision(registry, approval, "rejected", options.by ?? "workspace-admin", options.reason ?? "Rejected from the basichome CLI.");
  await writeRegistry(projectDir, registry);
  console.log(`Rejected ${approvalId}`);
}

async function commandApprovalsRequestChanges(args) {
  const options = parseOptions(args);
  const approvalId = options._[0];
  if (!approvalId) throw new Error("Approval id is required.");
  const projectDir = path.resolve(options.project ?? process.cwd());
  const registry = await readRegistry(projectDir);
  const approval = findRegistryApproval(registry, approvalId);
  if (!approval) throw new Error(`Approval ${approvalId} not found.`);
  setRegistryApprovalDecision(
    registry,
    approval,
    "changes_requested",
    options.by ?? "workspace-admin",
    options.reason ?? "Changes requested from the basichome CLI.",
  );
  await writeRegistry(projectDir, registry);
  console.log(`Changes requested for ${approvalId}`);
}

async function dispatchTrustCommand(args) {
  const group = args[0];
  const command = args[1];
  const rest = args.slice(2);
  if (group !== "grants" || !command || command === "help" || command === "--help") {
    printTrustHelp();
    return;
  }
  if (command === "list") await commandTrustGrantsList(rest);
  else if (command === "revoke") await commandTrustGrantsRevoke(rest);
  else throw new Error(`Unknown trust grants command "${command}".`);
}

async function commandTrustGrantsList(args) {
  const options = parseOptions(args);
  const projectDir = path.resolve(options.project ?? process.cwd());
  const registry = await readRegistry(projectDir);
  ensureDefaultTrustGrant(registry);
  await writeRegistry(projectDir, registry);

  for (const grant of registry.trustGrants.sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    console.log([
      grant.id,
      grant.status,
      `automation:${grant.automationId}`,
      `action:${grant.actionClass}`,
      `target:${grant.target}`,
      `expires:${grant.expiresAt}`,
    ].join("\t"));
  }
}

async function commandTrustGrantsRevoke(args) {
  const options = parseOptions(args);
  const grantId = options._[0];
  if (!grantId) throw new Error("Trust grant id is required.");
  const projectDir = path.resolve(options.project ?? process.cwd());
  const registry = await readRegistry(projectDir);
  ensureDefaultTrustGrant(registry);
  const grant = registry.trustGrants.find((candidate) => candidate.id === grantId);
  if (!grant) throw new Error(`Trust grant ${grantId} not found.`);
  if (grant.status === "revoked") {
    console.log(`${grantId} is already revoked`);
    return;
  }

  const now = nowIso();
  grant.status = "revoked";
  grant.revokedAt = now;
  const approval = findRegistryApproval(registry, grant.approvalId);
  if (approval) {
    setRegistryApprovalDecision(
      registry,
      approval,
      "revoked",
      options.by ?? "workspace-admin",
      options.reason ?? "Trust grant revoked from the basichome CLI; future autonomous runs must pause.",
    );
  }
  registry.logs.unshift(createLog({
    type: "trust_grant_revoked",
    message: `${grant.label} revoked; future ${grant.automationId} runs require approval.`,
    appId: undefined,
    releaseId: undefined,
    runtime: "admin_review",
    target: grant.target,
    payload: { trust_grant_id: grant.id, automation_id: grant.automationId },
  }));
  await writeRegistry(projectDir, registry);
  console.log(`Revoked ${grantId}`);
}

export function runAppDeploymentCheck(manifest, input = {}) {
  const errors = [];
  const warnings = [];
  const scanFindings = [];
  const filePaths = (input.filePaths ?? []).map(normalizePath);
  const fileContents = input.fileContents ?? {};
  const discoveredKinds = new Set(filePaths.map(discoverKindFromPath).filter(Boolean));
  const declaredKinds = new Set((manifest.units ?? []).map((unit) => unit.kind));

  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  for (const field of ["id", "name", "version", "description"]) {
    if (!manifest[field]?.trim?.()) errors.push(`${field} is required.`);
  }
  if (!/^app_[a-z0-9_]+$/.test(manifest.id ?? "")) errors.push("id must use app_snake_case format.");
  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) errors.push("At least one deployment target is required.");
  if (!Array.isArray(manifest.units) || manifest.units.length === 0) errors.push("At least one app unit is required.");
  if (!manifest.units?.some((unit) => unit.kind === "ui")) errors.push("A UI unit is required so the app can appear in basichome.");

  const unitNames = new Set();
  const unitPaths = new Set();
  for (const unit of manifest.units ?? []) {
    if (unitNames.has(unit.name)) errors.push(`Duplicate unit name "${unit.name}".`);
    if (unitPaths.has(unit.path)) errors.push(`Duplicate unit path "${unit.path}".`);
    unitNames.add(unit.name);
    unitPaths.add(unit.path);
    if (unit.kind === "ui" && unit.runtime !== "browser") errors.push(`UI unit "${unit.name}" must use browser runtime.`);
    if ((unit.kind === "service" || unit.kind === "worker") && unit.runtime !== "node22") errors.push(`${unit.kind} unit "${unit.name}" must use node22 runtime.`);
    if (unit.kind === "migration" && unit.runtime !== "sql") errors.push(`Migration unit "${unit.name}" must use sql runtime.`);
    if (unit.kind === "worker" && !unit.queue && !unit.schedule) warnings.push(`Worker unit "${unit.name}" has no queue or schedule.`);
  }
  for (const target of manifest.targets ?? []) {
    if (target !== "local" && target !== "cloud") errors.push(`Unsupported deployment target "${target}".`);
  }
  for (const route of manifest.routes ?? []) {
    if (!unitNames.has(route.unit)) errors.push(`Route ${route.source} references missing unit "${route.unit}".`);
  }
  for (const schedule of manifest.schedules ?? []) {
    if (!unitNames.has(schedule.unit)) errors.push(`Schedule ${schedule.id} references missing unit "${schedule.unit}".`);
  }
  for (const queue of manifest.queues ?? []) {
    if (!unitNames.has(queue.unit)) errors.push(`Queue ${queue.name} references missing unit "${queue.unit}".`);
    if (queue.concurrency < 1) errors.push(`Queue ${queue.name} concurrency must be at least 1.`);
  }
  for (const permission of manifest.permissions ?? []) {
    if (!permission.slug || !permission.reason) errors.push("Every permission needs a slug and reason.");
  }
  for (const secret of manifest.secrets ?? []) {
    if (!/^[A-Z0-9_]+$/.test(secret.name)) errors.push(`Secret ${secret.name} must use uppercase env-var format.`);
  }
  for (const kind of discoveredKinds) {
    if (!declaredKinds.has(kind)) {
      errors.push(`${kind} code exists in the project but no ${kind} unit is declared in basics.app.json.`);
    }
  }
  if (filePaths.length > 0) {
    for (const unit of manifest.units ?? []) {
      const unitPath = normalizePath(unit.path);
      if (!filePaths.some((candidate) => candidate === unitPath || candidate.startsWith(`${unitPath}/`) || unitPath.startsWith(`${candidate}/`))) {
        errors.push(`Declared ${unit.kind} unit "${unit.name}" points to ${unit.path}, but no matching file was found.`);
      }
    }
  }
  for (const [filePath, content] of Object.entries(fileContents)) {
    if (/-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(content) || /sk-[a-zA-Z0-9]{20,}/.test(content)) {
      scanFindings.push({ severity: "blocker", message: "Potential secret detected in app source.", path: filePath });
    }
    if (/\beval\s*\(/.test(content) || /new\s+Function\s*\(/.test(content)) {
      scanFindings.push({ severity: "blocker", message: "Dynamic code execution is blocked for private app bundles.", path: filePath });
    }
    if (/from ["']node:child_process["']|require\(["']child_process["']\)/.test(content)) {
      scanFindings.push({ severity: "blocker", message: "child_process access is blocked in basichome app bundles.", path: filePath });
    }
    if (/https?:\/\/(?!(localhost|127\.0\.0\.1|apps\.basichome\.local|basichome\.dev))/.test(content)) {
      scanFindings.push({ severity: "warning", message: "External network endpoint found; admin should verify this permission.", path: filePath });
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
    manifestUnits: manifest.units?.length ?? 0,
    discoveredUnits: discoveredKinds.size,
    artifactHash: input.artifactHash,
    scanFindings,
  };
}

async function loadProjectForCheck(projectDir) {
  const manifest = await readJson(path.join(projectDir, MANIFEST_FILE));
  const filePaths = await walk(projectDir);
  const sourcePaths = filePaths.filter((filePath) => /\.(ts|tsx|js|jsx|html|sql|json)$/.test(filePath));
  const fileContents = {};
  for (const relativePath of sourcePaths) {
    fileContents[relativePath] = await fs.readFile(path.join(projectDir, relativePath), "utf8");
  }
  return { manifest, filePaths, fileContents };
}

async function collectBundleFiles(projectDir) {
  const filePaths = await walk(projectDir);
  const files = [];
  for (const relativePath of filePaths) {
    const absolutePath = path.join(projectDir, relativePath);
    const content = await fs.readFile(absolutePath);
    files.push({
      path: relativePath,
      sha256: sha256(content),
      contentBase64: content.toString("base64"),
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function walk(rootDir, currentDir = rootDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (BLOCKED_DIRS.has(entry.name)) continue;
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizePath(path.relative(rootDir, absolutePath));
    if (entry.isDirectory()) files.push(...(await walk(rootDir, absolutePath)));
    else files.push(relativePath);
  }
  return files.sort();
}

async function readBundle(bundlePath) {
  const raw = await fs.readFile(bundlePath);
  const bundle = JSON.parse(gunzipSync(raw).toString("utf8"));
  if (bundle.kind !== BUNDLE_KIND) throw new Error(`${bundlePath} is not a basichome app bundle.`);
  if (!bundle.manifest || !bundle.check) throw new Error(`${bundlePath} is missing manifest or check data.`);
  return bundle;
}

async function readRegistry(projectDir) {
  const registryPath = path.join(projectDir, REGISTRY_DIR, REGISTRY_FILE);
  if (!existsSync(registryPath)) {
    return createEmptyRegistry();
  }
  return normalizeRegistry(await readJson(registryPath));
}

async function writeRegistry(projectDir, registry) {
  const registryPath = path.join(projectDir, REGISTRY_DIR, REGISTRY_FILE);
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
}

function createEmptyRegistry() {
  return { schemaVersion: 1, apps: [], releases: [], deployments: [], approvals: [], trustGrants: [], logs: [] };
}

function normalizeRegistry(registry) {
  return {
    schemaVersion: 1,
    ...registry,
    apps: Array.isArray(registry.apps) ? registry.apps : [],
    releases: Array.isArray(registry.releases) ? registry.releases : [],
    deployments: Array.isArray(registry.deployments) ? registry.deployments : [],
    approvals: Array.isArray(registry.approvals) ? registry.approvals : [],
    trustGrants: Array.isArray(registry.trustGrants) ? registry.trustGrants : [],
    logs: Array.isArray(registry.logs) ? registry.logs : [],
  };
}

function upsertAppFromBundle(registry, bundle, status, pendingReleaseId) {
  const app = registry.apps.find((candidate) => candidate.id === bundle.manifest.id);
  const target = targetFromManifest(bundle.manifest);
  const value = {
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    description: bundle.manifest.description,
    version: bundle.manifest.version,
    status,
    target,
    owner: "Private workspace",
    updatedAt: nowIso(),
    permissions: (bundle.manifest.permissions ?? []).map((permission) => permission.slug),
    health: status === "blocked" ? "blocked" : status === "installed" ? "healthy" : "warning",
    lastEvent: status === "installed" ? "Installed locally." : "Published for admin review.",
    cliProjectPath: process.cwd(),
    manifest: bundle.manifest,
    activeReleaseId: status === "installed" ? `rel_${bundle.manifest.id}_${bundle.manifest.version.replace(/\W/g, "_")}` : app?.activeReleaseId,
    pendingReleaseId,
    deploymentIds: app?.deploymentIds ?? [],
  };
  if (app) Object.assign(app, value);
  else registry.apps.unshift(value);
}

function upsertReleaseFromBundle(registry, bundle, status, approvalState, bundlePath) {
  const releaseId = `rel_${bundle.manifest.id}_${bundle.manifest.version.replace(/\W/g, "_")}`;
  const existing = registry.releases.find((release) => release.id === releaseId);
  const value = {
    id: releaseId,
    appId: bundle.manifest.id,
    version: bundle.manifest.version,
    status,
    approvalState,
    target: targetFromManifest(bundle.manifest),
    requestedBy: "basichome-cli",
    requestedAt: nowIso(),
    bundlePath,
    artifactHash: bundle.check.artifactHash,
    scanResult: bundle.check,
    manifest: bundle.manifest,
  };
  if (existing) Object.assign(existing, value);
  else registry.releases.unshift(value);
  return releaseId;
}

function createDeployment(manifest, releaseId, target) {
  const slug = manifest.id.replace(/^app_/, "").replace(/_/g, "-");
  return {
    id: `dep_${manifest.id}_${manifest.version.replace(/\W/g, "_")}_${target}_${Date.now().toString(36)}`,
    appId: manifest.id,
    releaseId,
    target,
    status: "active",
    endpoint: target === "local" ? `basichome://apps/${slug}` : `https://apps.basichome.local/${slug}`,
    serviceStatus: "ready",
    workerStatus: "ready",
    migrationStatus: "applied",
    deployedAt: nowIso(),
  };
}

function createLog({ type, message, appId, releaseId, deploymentId, runtime, target, payload }) {
  return {
    id: `log_${type}_${randomUUID()}`,
    type,
    message,
    appId,
    releaseId,
    deploymentId,
    actorAccountId: "local-dev-owner",
    deviceId: "device_local_dev",
    target,
    runtime,
    source: "basichome_cli_registry",
    createdAt: nowIso(),
    payload,
  };
}

function findRegistryRelease(registry, releaseId) {
  return registry.releases.find((candidate) => candidate.id === releaseId);
}

function findRegistryApproval(registry, approvalId) {
  return registry.approvals.find((candidate) => candidate.id === approvalId);
}

function upsertApprovalFromRelease(registry, releaseId, status = "pending") {
  const release = findRegistryRelease(registry, releaseId);
  if (!release) throw new Error(`Release ${releaseId} not found.`);
  const approvalId = `appr_${releaseId}`;
  const existing = findRegistryApproval(registry, approvalId);
  const manifest = release.manifest;
  const permissionCount = manifest.permissions?.length ?? 0;
  const cloudTarget = release.target === "cloud" || release.target === "local_and_cloud";
  const warningCount = release.scanResult.warnings?.length ?? 0;
  const failed = !release.scanResult.ok;
  const approval = {
    id: approvalId,
    workspaceId: "workspace_local",
    kind: existing?.kind ?? (registry.releases.some((candidate) => candidate.appId === release.appId && candidate.id !== releaseId && candidate.status === "deployed") ? "app_update" : "app_release"),
    status,
    risk: failed ? "critical" : cloudTarget || warningCount > 0 ? "high" : permissionCount > 1 ? "medium" : "low",
    objectName: `${manifest.name} ${manifest.version}`,
    objectId: releaseId,
    appId: release.appId,
    releaseId,
    requestedBy: {
      id: "local-dev-developer",
      name: "basichome CLI developer",
      email: "developer@basichome.local",
      roles: ["developer"],
    },
    requestedFor: release.target,
    requiredRole: "admin",
    reason: cloudTarget
      ? "Developer published a release that deploys beyond this device and requires workspace admin approval."
      : "Developer published a workspace app release that requires admin approval before install.",
    summary: `Deploys ${manifest.name} ${manifest.version} with ${manifest.units?.length ?? 0} declared unit(s).`,
    requestedAccess: buildRequestedAccess(manifest),
    runtimeUnits: buildRuntimeUnits(manifest),
    checks: buildApprovalChecks(release),
    changes: buildApprovalChanges(registry, release),
    artifactHash: release.artifactHash,
    rolloutTarget: release.target,
    rollbackPlan: "Keep the current active release until deployment health checks pass; rollback restores the previous deployed release.",
    dataBoundary: "Raw local capture and browser session material stay on the user's device. The app receives only declared permissions and writes audit logs.",
    costAndLimits: cloudTarget ? "Cloud worker and browser usage must stay inside workspace budget limits." : "Runs locally on this device unless the manifest later adds cloud targets.",
    tests: ["basics app check", "basics app build", "static scan", "admin approval gate"],
    logs: existing?.logs ?? [],
    requestedAt: existing?.requestedAt ?? release.requestedAt,
    expiresAt: existing?.expiresAt ?? isoFromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  };
  if (existing) Object.assign(existing, approval);
  else {
    const requestedLog = createRegistryApprovalLog(approval, "requested", "local-dev-developer", "developer", `${approval.objectName} requested admin approval.`);
    approval.logs = [requestedLog];
    registry.approvals.unshift(approval);
  }
  return approvalId;
}

function approveReleaseInRegistry(registry, releaseId, approvedBy) {
  const release = findRegistryRelease(registry, releaseId);
  if (!release) throw new Error(`Release ${releaseId} not found.`);
  if (!release.scanResult.ok) throw new Error("Release check is not OK; approval blocked.");
  release.status = "approved";
  release.approvalState = "approved";
  release.approvedBy = approvedBy;
  release.approvedAt = nowIso();
  const app = registry.apps.find((candidate) => candidate.id === release.appId);
  if (app) {
    app.status = "update_available";
    app.health = "warning";
    app.lastEvent = `Release ${release.version} approved and ready to deploy.`;
    app.updatedAt = nowIso();
  }
  registry.logs.unshift(createLog({
    type: "approval_granted",
    message: `${release.manifest.name} ${release.version} approved.`,
    appId: release.appId,
    releaseId,
    runtime: "admin_review",
    target: release.target,
    payload: { approved_by: approvedBy },
  }));
  const approvalId = `appr_${releaseId}`;
  const approval = findRegistryApproval(registry, approvalId) ?? findRegistryApproval(registry, upsertApprovalFromRelease(registry, releaseId, "pending"));
  setRegistryApprovalDecision(registry, approval, "approved", approvedBy, "Release approved by workspace admin.");
  return release;
}

function deployReleaseInRegistry(registry, releaseId) {
  const release = findRegistryRelease(registry, releaseId);
  if (!release) throw new Error(`Release ${releaseId} not found.`);
  if (release.approvalState !== "approved") throw new Error("Release must be approved before deploy.");
  if (!release.scanResult.ok) throw new Error("Release check is not OK; deploy blocked.");
  const targets = release.target === "local_and_cloud" ? ["local", "cloud"] : [release.target];
  for (const target of targets) {
    registry.deployments.unshift(createDeployment(release.manifest, releaseId, target));
  }
  release.status = "deployed";
  const app = registry.apps.find((candidate) => candidate.id === release.appId);
  if (app) {
    app.status = "installed";
    app.health = "healthy";
    app.version = release.version;
    app.activeReleaseId = releaseId;
    app.pendingReleaseId = undefined;
    app.lastEvent = `Release ${release.version} deployed to ${release.target}.`;
    app.updatedAt = nowIso();
  }
  registry.logs.unshift(createLog({
    type: "deployment_completed",
    message: `${release.manifest.name} ${release.version} deployed to ${release.target}.`,
    appId: release.appId,
    releaseId,
    runtime: release.target === "local" ? "local_app_runtime" : "basics_cloud_worker",
    target: release.target,
    payload: { artifact_hash: release.artifactHash, targets },
  }));
  const approval = findRegistryApproval(registry, `appr_${releaseId}`);
  if (approval) appendRegistryApprovalLog(registry, approval, "deployed", "workspace-admin", "admin", `basichome deployed ${approval.objectName} to ${release.target}.`);
  return release;
}

function setRegistryApprovalDecision(registry, approval, status, actorAccountId, reason) {
  const now = nowIso();
  approval.status = status;
  approval.decidedAt = now;
  approval.decidedBy = {
    id: actorAccountId,
    name: actorAccountId === "workspace-admin" ? "workspace admin" : actorAccountId,
    email: `${actorAccountId}@basichome.local`,
    roles: actorAccountId === "local-dev-developer" ? ["developer"] : ["admin"],
  };
  approval.decisionReason = reason;
  const event = status === "changes_requested" ? "changes_requested" : status;
  appendRegistryApprovalLog(registry, approval, event, actorAccountId, approval.decidedBy.roles[0], `${approval.objectName}: ${reason}`);
}

function appendRegistryApprovalLog(registry, approval, event, actorAccountId, actorRole, message) {
  const log = createRegistryApprovalLog(approval, event, actorAccountId, actorRole, message);
  approval.logs = [log, ...(approval.logs ?? [])];
  registry.logs.unshift(createLog({
    type: `approval_${event}`,
    message,
    appId: approval.appId,
    releaseId: approval.releaseId,
    runtime: "admin_review",
    target: approval.rolloutTarget,
    payload: { approval_id: approval.id, event },
  }));
  return log;
}

function createRegistryApprovalLog(approval, event, actorAccountId, actorRole, message) {
  return {
    id: `alog_${event}_${randomUUID()}`,
    approvalId: approval.id,
    event,
    actorAccountId,
    actorRole,
    message,
    createdAt: nowIso(),
  };
}

function approvalHasFailedChecks(approval) {
  return approval.checks?.some((check) => check.status === "failed");
}

function buildRequestedAccess(manifest) {
  const permissions = manifest.permissions ?? [];
  if (permissions.length === 0) return ["No extra app permissions requested."];
  return permissions.map((permission) => `${permission.slug}: ${permission.reason}`);
}

function buildRuntimeUnits(manifest) {
  return (manifest.units ?? []).map((unit) => ({
    kind: unit.kind,
    name: unit.name,
    detail: [unit.path, unit.route, unit.queue, unit.schedule].filter(Boolean).join(" | "),
  }));
}

function buildApprovalChecks(release) {
  const checks = [
    {
      label: "Manifest and unit coverage",
      status: release.scanResult.ok ? "passed" : "failed",
      detail: release.scanResult.summary,
    },
    {
      label: "Static bundle scan",
      status: release.scanResult.scanFindings?.some((finding) => finding.severity === "blocker") ? "failed" : release.scanResult.warnings?.length > 0 ? "warning" : "passed",
      detail: release.scanResult.warnings?.length > 0 ? release.scanResult.warnings.join(" ") : "No secret, dynamic code, child_process, or blocked network findings.",
    },
    {
      label: "Rollback plan",
      status: "passed",
      detail: "Previous deployed release remains available until the new release passes health checks.",
    },
  ];
  return checks;
}

function buildApprovalChanges(registry, release) {
  const previous = registry.releases.find((candidate) => candidate.appId === release.appId && candidate.id !== release.id && candidate.status === "deployed");
  const changes = [
    {
      label: "Version",
      before: previous?.version ?? "not installed",
      after: release.version,
      expandsPermission: false,
    },
    {
      label: "Target",
      before: previous?.target ?? "none",
      after: release.target,
      expandsPermission: release.target === "cloud" || release.target === "local_and_cloud",
    },
  ];
  const previousPermissions = new Set(previous?.manifest?.permissions?.map((permission) => permission.slug) ?? []);
  for (const permission of release.manifest.permissions ?? []) {
    changes.push({
      label: `Permission ${permission.slug}`,
      before: previousPermissions.has(permission.slug) ? permission.slug : "not granted",
      after: permission.slug,
      expandsPermission: !previousPermissions.has(permission.slug),
    });
  }
  return changes;
}

function ensureDefaultTrustGrant(registry) {
  const approvalId = "appr_trust_default_invoice_email";
  const grantId = "trust_default_invoice_email";
  if (!registry.trustGrants.some((grant) => grant.id === grantId)) {
    registry.trustGrants.unshift({
      id: grantId,
      approvalId,
      label: "Default invoice email trust",
      automationId: "auto_eod_invoice_review",
      actionClass: "outbound_email",
      actorAccountId: "workspace-admin",
      target: "cloud",
      scope: {
        tools: ["GMAIL_SEND_EMAIL"],
        connectedAccounts: ["gmail:sales@company.local"],
        domains: ["customer-billing"],
        recipients: ["known customer billing contacts"],
        amountLimitCents: 50_000,
        runLimitPerDay: 1,
      },
      status: "active",
      createdAt: nowIso(),
      expiresAt: isoFromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
      lastUsedAt: nowIso(),
    });
  }
  if (!findRegistryApproval(registry, approvalId)) {
    const grant = registry.trustGrants.find((candidate) => candidate.id === grantId);
    const approval = {
      id: approvalId,
      workspaceId: "workspace_local",
      kind: "trust_grant",
      status: grant.status === "active" ? "approved" : grant.status,
      risk: "medium",
      objectName: grant.label,
      objectId: grant.id,
      automationId: grant.automationId,
      trustGrantId: grant.id,
      requestedBy: {
        id: "workspace-admin",
        name: "workspace admin",
        email: "workspace-admin@basichome.local",
        roles: ["admin"],
      },
      requestedFor: "automation",
      requiredRole: "admin",
      reason: "Scoped trust grant lets a known automation run without pausing at every matching Gmail send.",
      summary: "Allows the invoice review automation to send approved billing emails inside strict limits.",
      requestedAccess: ["Use Gmail send for known customer billing contacts.", "Run once per weekday.", "Stay under 500 dollar invoice amount per send."],
      runtimeUnits: [{ kind: "tool", name: "GMAIL_SEND_EMAIL", detail: "outbound email tool" }],
      checks: [{ label: "Scoped limits", status: "passed", detail: "Tool, account, recipient, amount, and run limits are present." }],
      changes: [{ label: "Autonomy", before: "pause for approval", after: "trusted autonomous", expandsPermission: true }],
      rolloutTarget: "automation",
      rollbackPlan: "Revoke the trust grant; future mutating email sends pause for approval.",
      dataBoundary: "No raw Lens capture or cookie material leaves the device.",
      costAndLimits: "One run per day, max 500 dollar invoice amount, expires in 30 days.",
      tests: ["trust grant scope check", "revoke simulation"],
      logs: [],
      requestedAt: grant.createdAt,
      decidedAt: grant.createdAt,
      decidedBy: {
        id: "workspace-admin",
        name: "workspace admin",
        email: "workspace-admin@basichome.local",
        roles: ["admin"],
      },
      decisionReason: "Seed approval for local CLI trust grant proof.",
    };
    approval.logs = [createRegistryApprovalLog(approval, "approved", "workspace-admin", "admin", `${grant.label} approved with scoped limits.`)];
    registry.approvals.unshift(approval);
  }
}

function isoFromDate(date) {
  return date.toISOString();
}

function createSampleManifest({ appId, name, slug }) {
  return {
    $schema: "https://basichome.dev/schemas/basics.app.json",
    schemaVersion: 1,
    id: appId,
    name,
    version: "0.1.0",
    description: "Private basichome app with UI, Node service, worker, and migration units.",
    targets: ["local", "cloud"],
    units: [
      { kind: "ui", name: "dashboard", path: "apps/dashboard/index.html", runtime: "browser", route: `/apps/${slug}` },
      { kind: "service", name: "api", path: "services/api/src/index.ts", runtime: "node22", route: `/api/${slug}` },
      { kind: "worker", name: "lead-enrichment", path: "workers/lead-enrichment/src/index.ts", runtime: "node22", queue: "quote-leads" },
      { kind: "migration", name: "schema", path: "migrations/0001_quote_router.sql", runtime: "sql" },
    ],
    permissions: [
      { slug: "crm.read", reason: "Read lead records before quote drafting.", risk: "read" },
      { slug: "gmail.draft", reason: "Draft follow-up emails after approval.", risk: "write" },
      { slug: "runtime.logs", reason: "Write deployment and worker logs.", risk: "read" },
    ],
    secrets: [
      { name: "CRM_API_TOKEN", scope: "device", required: true },
      { name: "GMAIL_CONNECTOR_ID", scope: "workspace", required: true },
    ],
    routes: [
      { source: `/apps/${slug}`, unit: "dashboard" },
      { source: `/api/${slug}`, unit: "api" },
    ],
    schedules: [
      { id: "quote-followup-digest", unit: "lead-enrichment", cron: "0 17 * * 1-5", timezone: "America/Los_Angeles" },
    ],
    queues: [
      { name: "quote-leads", unit: "lead-enrichment", concurrency: 2 },
    ],
  };
}

function createPackageJson(slug) {
  return {
    name: slug,
    version: "0.1.0",
    private: true,
    type: "module",
    engines: { node: ">=22.0.0" },
    scripts: {
      check: "basics app check .",
      build: "basics app build .",
      test: "node --test",
    },
  };
}

function sampleHtml(name) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(name)}</title>
    <script type="module" src="./src/main.ts"></script>
  </head>
  <body>
    <main id="app"></main>
  </body>
</html>
`;
}

function sampleUiSource(name) {
  return `const root = document.getElementById("app");
if (root) {
  root.innerHTML = [
    "<section>",
    "<h1>${escapeHtml(name)}</h1>",
    "<p>Private basichome app installed from a checked .basics bundle.</p>",
    "</section>",
  ].join("");
}
`;
}

function sampleServiceSource() {
  return `export async function handleQuoteRequest(input: { leadId: string }) {
  return {
    ok: true,
    leadId: input.leadId,
    status: "ready_for_review",
  };
}
`;
}

function sampleWorkerSource() {
  return `export async function processLead(job: { leadId: string }) {
  return {
    ok: true,
    leadId: job.leadId,
    nextAction: "draft_quote",
  };
}
`;
}

function sampleMigration() {
  return `create table if not exists quote_router_events (
  id text primary key,
  lead_id text not null,
  status text not null,
  created_at timestamptz not null default now()
);
`;
}

function sampleTest() {
  return `import test from "node:test";
import assert from "node:assert/strict";

test("sample app smoke test", () => {
  assert.equal("basichome".includes("home"), true);
});
`;
}

function targetFromManifest(manifest) {
  const targets = manifest.targets ?? [];
  if (targets.includes("local") && targets.includes("cloud")) return "local_and_cloud";
  if (targets.includes("cloud")) return "cloud";
  return "local";
}

function resolveProjectDirFromBundle(bundlePath) {
  const distDir = path.dirname(bundlePath);
  return path.basename(distDir) === "dist" ? path.dirname(distDir) : process.cwd();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeFileIfAbsent(filePath, content, force) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (!force && existsSync(filePath)) return;
  await fs.writeFile(filePath, content);
}

function parseOptions(args) {
  const options = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      options._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

function printCheck(check) {
  console.log(check.ok ? "App deployment check passed" : "App deployment check failed");
  console.log(check.summary);
  for (const error of check.errors) console.log(`error: ${error}`);
  for (const warning of check.warnings) console.log(`warning: ${warning}`);
}

function printHelp() {
  console.log(`basics <group> <command>

App commands:
  init <dir> --name "Quote Router"
  check <dir>
  build <dir>
  install <dist/app.basics>
  publish <dist/app.basics>
  request-review <release-id> [--project <dir>]
  approve <release-id> [--project <dir>]
  deploy <release-id> [--project <dir>]
  rollback <app-id> [--project <dir>]
  logs [app-or-release-id] [--project <dir>]

Approval commands:
  approvals list [--project <dir>] [--status pending]
  approvals view <approval-id> [--project <dir>]
  approvals approve <approval-id> [--project <dir>] [--by workspace-admin]
  approvals reject <approval-id> [--project <dir>] [--reason "..."]
  approvals request-changes <approval-id> [--project <dir>] [--reason "..."]

Trust commands:
  trust grants list [--project <dir>]
  trust grants revoke <grant-id> [--project <dir>] [--reason "..."]
`);
}

function printApprovalHelp() {
  console.log(`basics approvals <command>

Commands:
  list [--project <dir>] [--status pending]
  view <approval-id> [--project <dir>]
  approve <approval-id> [--project <dir>] [--by workspace-admin]
  reject <approval-id> [--project <dir>] [--reason "..."]
  request-changes <approval-id> [--project <dir>] [--reason "..."]
`);
}

function printTrustHelp() {
  console.log(`basics trust grants <command>

Commands:
  list [--project <dir>]
  revoke <grant-id> [--project <dir>] [--reason "..."]
`);
}

function discoverKindFromPath(filePath) {
  if (/^(apps|ui)\//.test(filePath)) return "ui";
  if (/^(services|service)\//.test(filePath)) return "service";
  if (/^(workers|worker)\//.test(filePath)) return "worker";
  if (/^migrations\//.test(filePath)) return "migration";
  return undefined;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "private-app";
}

function titleCase(value) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function hashJson(value) {
  return sha256(Buffer.from(JSON.stringify(value)));
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

main();
