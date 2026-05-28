import test from "node:test";
import assert from "node:assert/strict";

import {
  approveWorkspaceAppRelease,
  createInitialWorkspaceAppsStore,
  deployWorkspaceAppRelease,
  rollbackWorkspaceApp,
  runAppDeploymentCheck,
} from "./workspace-apps-runtime";
import type { BasicsAppManifest } from "@/types/apps";

function fullStackManifest(): BasicsAppManifest {
  return {
    schemaVersion: 1,
    id: "app_quote_router_test",
    name: "Quote Router Test",
    version: "0.1.0",
    description: "Full-stack test app.",
    targets: ["local", "cloud"],
    units: [
      { kind: "ui", name: "dashboard", path: "apps/dashboard/index.html", runtime: "browser", route: "/apps/quote-router-test" },
      { kind: "service", name: "api", path: "services/api/src/index.ts", runtime: "node22", route: "/api/quote-router-test" },
      { kind: "worker", name: "lead-enrichment", path: "workers/lead-enrichment/src/index.ts", runtime: "node22", queue: "quote-leads" },
      { kind: "migration", name: "schema", path: "migrations/0001_quote_router.sql", runtime: "sql" },
    ],
    permissions: [
      { slug: "crm.read", reason: "Read leads.", risk: "read" },
      { slug: "runtime.logs", reason: "Write app logs.", risk: "read" },
    ],
    secrets: [
      { name: "CRM_API_TOKEN", scope: "device", required: true },
    ],
    routes: [
      { source: "/quote-router-test", unit: "dashboard" },
      { source: "/api/quote-router-test", unit: "api" },
    ],
    schedules: [],
    queues: [
      { name: "quote-leads", unit: "lead-enrichment", concurrency: 2 },
    ],
  };
}

test("runAppDeploymentCheck passes a complete full-stack app manifest", () => {
  const manifest = fullStackManifest();
  const check = runAppDeploymentCheck(manifest, {
    filePaths: manifest.units.map((unit) => unit.path),
    fileContents: {
      "services/api/src/index.ts": "export function handleQuote() { return { ok: true }; }",
    },
    artifactHash: "sha256:test",
  });

  assert.equal(check.ok, true);
  assert.equal(check.errors.length, 0);
  assert.equal(check.manifestUnits, 4);
  assert.equal(check.discoveredUnits, 4);
});

test("runAppDeploymentCheck fails closed when backend code is missing from the manifest", () => {
  const manifest = fullStackManifest();
  const check = runAppDeploymentCheck(
    {
      ...manifest,
      units: manifest.units.filter((unit) => unit.kind !== "service"),
    },
    {
      filePaths: [
        "apps/dashboard/index.html",
        "services/api/src/index.ts",
        "workers/lead-enrichment/src/index.ts",
        "migrations/0001_quote_router.sql",
      ],
    },
  );

  assert.equal(check.ok, false);
  assert.match(check.errors.join("\n"), /service code exists/);
});

test("workspace app approval, deploy, and rollback update releases, deployments, and logs", () => {
  const initial = createInitialWorkspaceAppsStore();
  const pendingRelease = initial.releases.find((release) => release.id === "rel_quote_router_010");
  assert.ok(pendingRelease);

  const approved = approveWorkspaceAppRelease(initial, pendingRelease.id);
  assert.equal(approved.releases.find((release) => release.id === pendingRelease.id)?.approvalState, "approved");

  const deployed = deployWorkspaceAppRelease(approved, pendingRelease.id);
  const app = deployed.apps.find((candidate) => candidate.id === "app_quote_router");
  assert.equal(app?.version, "0.1.0");
  assert.equal(app?.status, "installed");
  assert.ok(deployed.deployments.some((deployment) => deployment.releaseId === pendingRelease.id && deployment.target === "cloud"));
  assert.ok(deployed.logs.some((log) => log.type === "deployment_completed" && log.releaseId === pendingRelease.id));

  const rolledBack = rollbackWorkspaceApp(deployed, "app_quote_router");
  const rolledBackApp = rolledBack.apps.find((candidate) => candidate.id === "app_quote_router");
  assert.equal(rolledBackApp?.version, "0.0.9");
  assert.ok(rolledBack.logs.some((log) => log.type === "rollback_completed"));
});
