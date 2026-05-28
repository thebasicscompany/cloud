# Electron Integration Plan

This is the work plan for turning the `cloud` web prototype into the final Basichome Electron app.

## Integration Principle

Do not rebuild the product from scratch. Treat the cloud branch as the product UX and contract prototype, then wire those surfaces into the real desktop client.

The final app needs three layers:

1. Electron shell and native permissions.
2. Local services through typed IPC.
3. Cloud services through authenticated API/SSE clients.

## Target Architecture

```text
Electron renderer
  Basichome UI
  Overlay pill UI
  Local-first product state

Electron main process
  Auth/session bridge
  Typed IPC registry
  Permission manager
  Local service supervisor
  Browser profile manager
  Cloud API client
  Log/event router

Local services
  Lens capture daemon
  Local context store/index
  Local agent harness
  Managed browser runtime
  Local app runtime

Basics Cloud
  Workspace auth
  Durable runs
  Cloud automations
  Worker/app deployments
  Approval streams
  Audit storage
  Redacted eval export
```

## Phase 1 - Bring Basichome UI Into Desktop

Goal: the Electron app opens the Basichome main window and overlay pill with the new product structure.

Tasks:

- Decide whether to embed the existing Next web UI or port components into the desktop renderer.
- Preserve the route structure from the cloud branch: Home, Browser, Runs, Automations, Apps, Approvals, Context, Logs/Audit, Settings.
- Keep the overlay pill as a separate window/surface.
- Reuse the visual system from the cloud branch where practical.
- Make the app launch into onboarding if setup is incomplete.

Exit criteria:

- Desktop launches without a web server in production mode.
- The main app renders all Basichome routes.
- Overlay pill can open and close the main app.
- No broken route placeholders for core product areas.

## Phase 2 - Auth And Workspace Bridge

Goal: desktop has reliable user/workspace auth and cloud API access.

Tasks:

- Connect sign-in to the current web/auth/desktop-login bridge.
- Persist Supabase session locally in the desktop-safe store.
- Mint workspace JWT from cloud API.
- Re-mint on 401 and retry once.
- Expose current account/workspace/role to renderer through IPC.
- Add signed-out, no-workspace, and token-expired states.

Exit criteria:

- User can sign in from desktop.
- Cloud API calls include the workspace token.
- Workspace switch updates all cloud-backed views.
- Auth errors are visible and recoverable.

## Phase 3 - Native Onboarding And Permissions

Goal: onboarding drives real OS permission setup.

Tasks:

- Request or deep-link to Screen Recording permission.
- Request or deep-link to Accessibility permission.
- Request or deep-link to Input Monitoring where needed.
- Explain local capture, pause/resume, and local storage in product language.
- Store onboarding completion and permission status locally.
- Make incomplete required permissions visible on Home and Settings.

Exit criteria:

- First run walks the user through permissions.
- Permission status is accurate after app restart.
- Capture does not start before consent.
- User can pause capture from onboarding, Home, Context, and overlay.

## Phase 4 - Lens Capture And Local Context Store

Goal: the Context UI talks to the real local capture system.

Tasks:

- Start/stop/supervise the Lens daemon from Electron main.
- Read capture health, source list, queue depth, and last event time.
- Store raw capture on device.
- Build a local context index/query layer for the agent.
- Implement redaction and source exclusions.
- Add retention controls.
- Emit platform log events for capture start, pause, resume, redaction, errors, and retention cleanup.

Exit criteria:

- Context page reflects real capture state.
- Pause/resume actually affects capture.
- Raw capture remains local.
- Agent can query approved local context.
- Logs show capture lifecycle events.

## Phase 5 - Local Agent Harness

Goal: the local agent workbench executes real tasks.

Tasks:

- Connect the local agent runtime model to an actual local agent process or service.
- Support Codex-powered execution when available.
- Add engine state: installed, connected, unavailable, policy-blocked, auth-needed.
- Route local context access through a permissioned query layer.
- Emit run events to the Runs page and overlay.
- Implement cancel, pause, resume, and approval wait states.
- Preserve every tool call in logs.

Exit criteria:

- User can ask a local agent to do a simple task.
- The task produces live run events.
- The run can be cancelled.
- Approval-required actions pause safely.
- Logs show prompt, context access summary, tools, result, and errors.

## Phase 6 - Browser Runtime

Goal: browser tasks work locally in a real controlled browser.

Tasks:

- Create a managed local browser profile.
- Prompt user to log in to required sites.
- Save cookies/session state on device.
- Reuse cookies/session state for future tasks.
- Implement active-browser mode only through explicit user choice.
- Make control state visible in the UI and overlay.
- Add stop/takeover controls.
- Log browser navigation, tool calls, screenshots where allowed, errors, and session state changes.

Exit criteria:

- Managed-browser task can log in and reuse the session.
- Active-browser mode cannot start accidentally.
- User can stop browser control immediately.
- Browser logs are tied to run IDs.

## Phase 7 - Cloud Promotion And Durable Automations

Goal: local work can be promoted to cloud when cloud is the right runtime.

Tasks:

- Connect Automations UI to cloud endpoints from `docs/DESKTOP-API-REFERENCE.md`.
- Support manual cloud run, schedule, cancel, and status stream.
- Use SSE for live run updates.
- Show live Browserbase view when available.
- Store cloud run summaries locally for quick recall.
- Make cloud usage/cost/API-key requirements clear.
- Later: add VPC/private deployment option behind the same product model.

Exit criteria:

- User can create or select an automation.
- User can run it locally or in cloud when supported.
- Scheduled cloud run state is visible.
- Cloud run events stream into Runs and Logs.
- Failed cloud runs are inspectable.

## Phase 8 - Admin Approvals And Trust Grants

Goal: risky actions fail closed and are understandable.

Tasks:

- Connect approval list/detail UI to local and cloud approval sources.
- Push urgent approval prompts to overlay.
- Support approve, deny, remember, revoke, and expire states.
- Show exactly what will happen before approval.
- Record decided-by, decided-at, scope, and source.
- Make first-time admin setup clear.

Exit criteria:

- Pending approval appears in main UI and overlay.
- Approving resumes the correct run.
- Denying blocks the action.
- Remember creates a narrow trust grant.
- Revoke prevents future auto-approval.
- Expired approvals fail closed.

## Phase 9 - Private Apps And CLI

Goal: users can build private tools for their Basichome workspace.

Tasks:

- Move or package `scripts/basics-app-cli.mjs` for desktop developer use.
- Support local app templates.
- Validate app manifest, permissions, UI entry, backend worker, and logs.
- Install local apps into the desktop app.
- Publish workspace app bundles to cloud.
- Deploy backend/worker code where required.
- Route app updates through admin approval when policy requires it.
- Add rollback and version history.

Exit criteria:

- `pnpm basics` or the packaged CLI can create a valid app.
- CLI check catches broken manifests and unsafe permissions.
- App appears in the desktop Apps area.
- Backend worker code deploys or fails with clear logs.
- Admin can approve or reject app updates.
- Rollback restores the previous working version.

## Phase 10 - Logs, Audit, Replay, And Evals

Goal: the user and engineering team can prove what happened.

Tasks:

- Create a unified local event envelope.
- Sync approved cloud events into the local log view.
- Attach run IDs, workspace IDs, app IDs, approval IDs, and source IDs.
- Add filters for local, cloud, browser, app, context, approvals, errors, and feedback.
- Add feedback labels.
- Add training/eval export preview.
- Redact sensitive values before any export.

Exit criteria:

- Every important action has a log event.
- Logs can reconstruct a run.
- User can label outcome quality.
- Export preview shows what would leave the device.
- Raw screen capture is not exported by default.

## Phase 11 - Packaging, Auto Update, And Org Rollout

Goal: Basichome ships as a real desktop app.

Tasks:

- Package Electron for macOS first.
- Add code signing and notarization.
- Wire auto-update.
- Define stable release channels.
- Decide admin-controlled rollout behavior for company installs.
- Keep CLI/app updates separate from desktop binary updates where possible.
- Add crash/error reporting that respects local-first data rules.

Exit criteria:

- Clean install works on a fresh Mac.
- Auto-update works.
- Admin/org update policy is documented.
- Rollback path exists.
- No release blocker remains undocumented.
