import test from "node:test";
import assert from "node:assert/strict";

import {
  approvalExpandsPermissions,
  createInitialApprovalStore,
  decideApproval,
  evaluateApprovalPolicy,
  evaluateAutonomousRunPolicy,
  findApproval,
  markApprovalDeployed,
  revokeTrustGrant,
} from "./admin-approvals-runtime";

test("policy blocks developer approval for permission-expanding cloud app updates", () => {
  const decision = evaluateApprovalPolicy({
    actorRoles: ["developer"],
    kind: "app_update",
    expandsPermissions: true,
    scanOk: true,
    target: "cloud",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.approvalRequired, true);
  assert.equal(decision.requiredRole, "admin");
  assert.match(decision.reason, /require workspace admin/i);
});

test("admin approval transitions app release and records deployment audit", () => {
  const initial = createInitialApprovalStore();
  const approval = findApproval(initial, "appr_app_quote_router_010");
  assert.ok(approval);
  assert.equal(approvalExpandsPermissions(approval), true);

  const approved = decideApproval(initial, approval.id, "approve", "Approved for rollout.");
  const approvedRecord = findApproval(approved, approval.id);
  assert.equal(approvedRecord?.status, "approved");
  assert.equal(approvedRecord?.decidedBy?.roles.includes("admin"), true);
  assert.ok(approved.logs.some((log) => log.approvalId === approval.id && log.event === "approved"));

  const deployed = markApprovalDeployed(approved, approval.id);
  assert.ok(findApproval(deployed, approval.id)?.logs.some((log) => log.event === "deployed"));
});

test("scan failures fail closed even for an owner/admin", () => {
  const store = createInitialApprovalStore();
  const rejectedProfileApproval = findApproval(store, "appr_browser_profile_cloud_sync");
  assert.ok(rejectedProfileApproval);

  const next = decideApproval(store, rejectedProfileApproval.id, "approve", "Try to override.");
  assert.equal(findApproval(next, rejectedProfileApproval.id)?.status, "rejected");
  assert.ok(next.logs.some((log) => log.approvalId === rejectedProfileApproval.id && log.event === "policy_evaluated"));
});

test("revoking a trust grant forces future autonomous runs back to approval required", () => {
  const initial = createInitialApprovalStore();
  const before = evaluateAutonomousRunPolicy(initial, "auto_eod_invoice_review");
  assert.equal(before.allowed, true);
  assert.equal(before.mode, "trusted_autonomous");

  const revoked = revokeTrustGrant(initial, "trust_eod_invoice_email_500", "Manual safety reset.");
  const after = evaluateAutonomousRunPolicy(revoked, "auto_eod_invoice_review");
  assert.equal(after.allowed, false);
  assert.equal(after.mode, "approval_required");
  assert.ok(revoked.logs.some((log) => log.event === "revoked"));
});
