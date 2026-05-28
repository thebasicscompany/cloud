# Runtime, API, And IPC Contracts

The final Electron app needs stable contracts between renderer UI, Electron main, local services, and cloud APIs.

The web prototype currently uses hooks and local runtime modules. Those modules should become the contract reference for the desktop IPC/API layer.

## Contract Sources In This Branch

Use these files as source material:

- `web/src/lib/local-context.ts`
- `web/src/lib/local-agent-runtime.ts`
- `web/src/lib/codex-engine.ts`
- `web/src/lib/browser-runtime.ts`
- `web/src/lib/cloud-automation-runtime.ts`
- `web/src/lib/admin-approvals-runtime.ts`
- `web/src/lib/workspace-apps-runtime.ts`
- `web/src/lib/platform-events-runtime.ts`
- `web/src/types/local-context.ts`
- `web/src/types/local-agent.ts`
- `web/src/types/codex-engine.ts`
- `web/src/types/browser-runtime.ts`
- `web/src/types/cloud-automation.ts`
- `web/src/types/approvals.ts`
- `web/src/types/apps.ts`
- `web/src/types/platform-events.ts`

## Renderer To Main IPC

Electron renderer should not talk directly to local daemons, browser profiles, file stores, or privileged OS APIs.

Required IPC namespaces:

```text
basichome:auth:*
basichome:onboarding:*
basichome:permissions:*
basichome:context:*
basichome:agent:*
basichome:browser:*
basichome:cloud:*
basichome:approvals:*
basichome:apps:*
basichome:logs:*
basichome:settings:*
```

## Auth Contract

Renderer needs:

- Current account.
- Current workspace.
- Role.
- Session state.
- Sign-in URL or desktop login bridge state.
- Workspace JWT status.

Main process owns:

- Supabase session storage.
- Workspace token minting.
- 401 retry.
- Secure token storage.

## Permissions Contract

Renderer needs:

- `screenRecording.status`
- `accessibility.status`
- `inputMonitoring.status`
- `captureConsent.status`
- `browserControlConsent.status`

Main process owns:

- OS permission checks.
- Deep-links to System Settings.
- Local consent persistence.
- Guarding feature access when permission is missing.

## Context Contract

Renderer needs:

- Capture running/paused/error state.
- Sources.
- Local storage size.
- Last capture time.
- Redaction state.
- Retention policy.
- Query previews and allowed summaries.

Main process owns:

- Starting and stopping Lens daemon.
- Local raw capture storage path.
- Local context index.
- Source exclusions.
- Redaction pipeline.
- Context query API for local agent.

No raw capture should be sent to cloud by default.

## Local Agent Contract

Renderer needs:

- Create local run.
- List runs.
- Get run detail.
- Subscribe to run events.
- Cancel run.
- Pause run.
- Resume run.
- Submit approval decision.
- Read engine status.

Main process owns:

- Local agent process lifecycle.
- Tool registry.
- Local context access.
- Browser runtime access.
- Approval gating.
- Event persistence.
- Log emission.

Run event types should include:

```text
run_created
run_started
agent_message
context_query
tool_call_started
tool_call_finished
browser_action
approval_requested
approval_resolved
run_paused
run_resumed
run_cancelled
run_failed
run_completed
```

## Codex Engine Contract

Renderer needs:

- Engine availability.
- Provider/account state.
- Policy state.
- Last health check.
- What execution mode will be used.

Main process owns:

- Detecting Codex availability.
- Starting or connecting to the engine.
- Handling auth or subscription state.
- Enforcing workspace policy.
- Fallback model routing when Codex is unavailable.

## Browser Runtime Contract

Renderer needs:

- Managed profile status.
- Site login state.
- Active browser permission state.
- Current browser task.
- Live view where available.
- Stop/takeover controls.

Main process owns:

- Managed browser process.
- Cookie/session store.
- Active-browser attachment.
- Browser automation driver.
- Screenshots and redaction rules.
- Immediate stop.

Required modes:

```text
managed_local
active_browser
cloud_browser
```

Default mode must be `managed_local`.

## Cloud Automation Contract

Renderer needs:

- List automations.
- Create/update automation.
- Run now.
- Schedule.
- Cancel.
- Subscribe to events.
- Promote local run to cloud automation.
- Show cloud logs and approvals.

Main process owns:

- Authenticated API client.
- SSE reconnect/resume.
- Local cache.
- Policy checks.

Cloud API reference:

- `docs/DESKTOP-API-REFERENCE.md`

Important existing endpoints:

- `POST /v1/auth/token`
- `POST /v1/automations`
- `GET /v1/automations`
- `POST /v1/automations/:id/run`
- `POST /v1/runs`
- `GET /v1/runs/:id`
- `GET /v1/runs/:id/events`
- `POST /v1/runs/:id/cancel`
- `GET /v1/workspaces/:wsId/approvals`
- `GET /v1/workspaces/:wsId/approvals/stream`
- `POST /v1/approvals/:id`

## Approvals Contract

Approvals must support local and cloud sources with one UI model.

Required fields:

```text
id
source
workspaceId
runId
appId
toolName
actionName
riskLevel
previewText
requestedAt
expiresAt
status
decision
decidedBy
decidedAt
rememberAvailable
trustGrantId
```

Allowed sources:

```text
local_agent
local_browser
cloud_run
workspace_app
admin_policy
```

Fail-closed rule:

- Missing approval means do not execute the risky action.
- Expired approval means do not execute the risky action.
- Ambiguous approval source means do not execute the risky action.
- Revoked trust grant means do not auto-approve.

## Apps Contract

The private app system needs both CLI and desktop contracts.

CLI commands should cover:

```text
basics app init
basics app check
basics app build
basics app dev
basics app install
basics app publish
basics app submit
basics app approve
basics app deploy
basics app rollback
```

Desktop needs:

- Installed apps.
- Workspace apps.
- App version history.
- App permissions.
- Backend worker status.
- Deployment logs.
- Approval state.
- Rollback state.

Cloud needs:

- Bundle upload.
- Manifest validation.
- Worker deploy.
- Version activation.
- Rollback.
- Audit trail.

## Logs Contract

Use a single platform event envelope.

Required fields:

```text
id
timestamp
workspaceId
userId
source
sourceId
runId
appId
approvalId
eventType
severity
summary
payload
redaction
localOnly
syncStatus
```

Log storage rules:

- Local logs are the first source of truth for local actions.
- Cloud logs can be mirrored locally for unified inspection.
- Raw private capture stays local.
- Export requires explicit preview and consent.
- Redaction metadata must travel with every synced/exported event.
