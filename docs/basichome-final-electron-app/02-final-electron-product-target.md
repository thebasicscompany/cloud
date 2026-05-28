# Final Electron Product Target

Basichome should ship as a desktop-first local AI work home with optional cloud promotion.

The web product in this branch is the control-plane prototype. The final product should live in the native Electron desktop app and feel like one integrated operating layer: overlay pill, main app, local context, local agent, browser runtime, cloud automations, apps, approvals, and logs.

## Product Promise

The user can install Basichome, grant local permissions, let it understand their work context on device, ask an agent to do work, supervise the agent when needed, and promote durable work to cloud when local execution is not the right fit.

## Core User Loop

1. User installs the Electron app.
2. User signs in.
3. User completes onboarding.
4. User grants local permissions.
5. Basichome starts local context capture only after consent.
6. User asks the local agent to do work.
7. Agent uses local context, browser runtime, and approved tools.
8. Risky actions pause for approval.
9. Long-running or scheduled work is promoted to cloud.
10. User can inspect logs, replay what happened, label outcomes, and revoke trust.

## First Run Experience

The final app needs an onboarding flow that makes these things clear:

- What Basichome can see.
- What stays on device.
- What can be sent to cloud.
- Which permissions are required versus optional.
- How local browser sessions work.
- How active-browser control is different from managed-browser control.
- How approvals work.
- How logs work.
- How to pause capture.

Do not hide permission setup inside settings. It must be a first-class setup flow because the product depends on trust.

## Main App Areas

The Electron main window should include:

- Home - daily work state, local agent, live runs, context state, approvals, cloud status.
- Browser - managed browser tasks and explicit active-browser mode.
- Runs - every local and cloud run.
- Automations - local saved automations and cloud durable automations.
- Apps - private apps and tools built for the workspace.
- Approvals - pending, resolved, trust grants, revoke paths.
- Context - Lens capture status, sources, pause/resume, redaction, retention.
- Logs/Audit - event log across agent, app, browser, context, cloud, approvals.
- Settings - account, workspace, permissions, model/engine, developer mode, privacy.

## Overlay Pill

The overlay pill should be the always-available control point, not the whole app.

It should show:

- Agent status.
- Capture status.
- Pending approvals.
- Current run progress.
- Quick pause/resume.
- Quick open main app.
- Minimal safe actions.

It should not become a large dashboard. The main window owns deep management.

## Local First Defaults

Default behavior:

- Raw screen/app/browser capture stays on device.
- Local context index stays on device.
- Local agent uses local context without uploading raw screen data.
- Managed browser runs locally for generic tasks.
- Active browser control requires explicit user choice.
- Cloud receives only approved, distilled, redacted, or action-log data.

Cloud behavior:

- Scheduled runs.
- Overnight runs.
- Long-running runs.
- Shared/team-visible runs.
- Durable retry/replay work.
- Server-side app workers.
- Admin-managed org policies.

## Browser Runtime Target

The product needs two browser modes:

### Managed local browser

Default for generic tasks.

- Runs in a separate managed profile.
- Prompts user to log in when needed.
- Saves cookies/session state on device.
- Reuses saved state for future tasks.
- Keeps automation isolated from the user's active browser.

### Active browser

Only when the user explicitly chooses it.

- Used when the user starts from the current page.
- Requires clear UI confirmation.
- Shows when the agent is observing or controlling the page.
- Allows immediate pause/stop.

## Cloud Promotion Target

The user should not need to think in infrastructure terms. They should see:

- Run locally.
- Save automation.
- Run on schedule.
- Run overnight.
- Run in cloud.
- Run in company/VPC environment later.

Behind the scenes, Basichome decides whether the work is local, cloud, or eventually VPC based on durability, access, policy, and runtime requirements.

## Private Apps Target

Users and teams should be able to build private tools for their own Basichome workspace.

The CLI should support:

- Create app.
- Validate app.
- Build app.
- Run locally.
- Install into desktop.
- Publish to workspace.
- Submit for approval.
- Deploy backend/worker code.
- Roll back.

The Apps area in the main UI should show app health, versions, installs, approvals, permissions, logs, and rollback controls.

## Data And Logs Target

Every important action should produce a log event:

- User action.
- Agent decision.
- Tool call.
- Browser action.
- Context capture state change.
- App CLI action.
- App deployment.
- Approval request.
- Approval decision.
- Cloud run event.
- Error.
- Feedback label.
- Training/eval export.

Logs must support user trust first, debugging second, and future model improvement third.

## Long-Term Model Improvement Target

Basichome should eventually collect consented, redacted, structured traces that can become:

- Eval datasets.
- Replay tasks.
- Reward signals.
- Org-specific workflow data.
- Computer-use training environments.
- Custom model fine-tuning or inference optimization inputs.

This must not require uploading raw private screen capture by default.
