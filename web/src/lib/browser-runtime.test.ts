import assert from "node:assert/strict";
import { test } from "node:test";

import {
  browserTargetLabel,
  createInitialBrowserRuntimeStore,
  domainFromBrowserPrompt,
  normalizeBrowserDomain,
  openBrowserLoginPrompt,
  recordBrowserCloudPromotion,
  recordBrowserRunViewMode,
  revokeBrowserProfile,
  saveBrowserLoginPrompt,
  selectManagedProfileForDomain,
} from "@/lib/browser-runtime";

test("normalizes domains and infers common browser task sites", () => {
  assert.equal(normalizeBrowserDomain("https://www.example.com/path"), "example.com");
  assert.equal(domainFromBrowserPrompt("Open Hacker News and summarize the top stories."), "news.ycombinator.com");
  assert.equal(domainFromBrowserPrompt("Check my QuickBooks invoice queue."), "app.qbo.intuit.com");
  assert.equal(browserTargetLabel("local_visible_browser"), "Use my active browser");
});

test("managed login prompt saves only local profile metadata", () => {
  const opened = openBrowserLoginPrompt(createInitialBrowserRuntimeStore(), "jobboardpro.example");
  assert.equal(opened.activeLoginPrompt?.domain, "jobboardpro.example");
  assert.equal(selectManagedProfileForDomain(opened, "jobboardpro.example")?.status, "needs_login");

  const saved = saveBrowserLoginPrompt(opened);
  const profile = selectManagedProfileForDomain(saved, "jobboardpro.example");
  assert.equal(saved.activeLoginPrompt?.status, "saved");
  assert.equal(profile?.status, "ready");
  assert.equal(profile?.deviceOnly, true);
  assert.equal(profile?.cloudSyncStatus, "not_synced");
  assert.ok((profile?.cookieCount ?? 0) > 0);
});

test("profile revoke, view mode, and cloud promotion do not expose cookie values", () => {
  const store = saveBrowserLoginPrompt(openBrowserLoginPrompt(createInitialBrowserRuntimeStore(), "app.hubspot.com"));
  const profileId = selectManagedProfileForDomain(store, "app.hubspot.com")?.id;
  assert.ok(profileId);

  const watched = recordBrowserRunViewMode(store, "run_browser_1", "watching");
  assert.equal(watched.runViewModes.run_browser_1, "watching");

  const promoted = recordBrowserCloudPromotion(watched, "run_browser_1", "app.hubspot.com");
  assert.equal(promoted.cloudPromotions[0]?.status, "approval_required");
  assert.equal(selectManagedProfileForDomain(promoted, "app.hubspot.com")?.cloudSyncStatus, "approval_required");

  const revoked = revokeBrowserProfile(promoted, profileId);
  const revokedProfile = revoked.profiles.find((profile) => profile.id === profileId);
  assert.equal(revokedProfile?.status, "revoked");
  assert.equal(revokedProfile?.cookieCount, 0);
});
