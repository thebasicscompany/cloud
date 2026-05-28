# Open Blockers And Owner Decisions

This file lists what must be resolved before the final Electron app can ship.

## Known Blockers From The Basichome Build

These were documented in the Basichome handoffs and should be rechecked before final release:

- `client/assistant` has lint failures.
- `client/assistant` has stable test failures.
- Swift client work needs Swift tools 6.2.
- Lens daemon/distill checks need missing local `cargo`/`uv` setup fixed.
- `basics-landing-page` builds, but has a stale Next 16 lint script.
- `basics-landing-page` had npm audit findings during the earlier release-readiness pass.
- The cloud branch has a product prototype but not production API backing for every new Basichome surface.

## Product Decisions That Are Already Locked

Do not re-debate these unless Harashith explicitly changes direction.

- Product name: Basichome / `basichome`.
- Local-first by default.
- Raw capture stays on device by default.
- Cloud receives approved, distilled, redacted, or action-log data unless future consent flows change this.
- Managed local browser is the default browser mode.
- Active-browser mode is explicit opt-in.
- Cloud is for scheduled, overnight, durable, shared, or long-running work.
- Private apps are for workspace/company-built tools first, not a public marketplace first.
- CLI is the primary developer entry point for private apps.
- Admin approvals and trust grants must fail closed.
- Logs are a first-class product surface.

## Decisions Still Needed

### Desktop UI integration method

Choose one:

- Embed the Next UI inside Electron.
- Port the Basichome components into the existing desktop renderer.
- Hybrid: use web UI for early internal builds, then port core surfaces.

Recommended:

- Start with the fastest path that runs inside Electron.
- Move privileged/local behavior behind IPC either way.
- Do not let renderer code directly own local daemon, browser, or file access.

### Local agent harness owner

Decide whether the local agent is:

- A bundled service launched by Electron.
- An external Codex-backed engine the app connects to.
- A hybrid where Codex powers tasks when available and local fallback handles smaller work.

Required either way:

- Engine state in Settings.
- Clear unavailable/auth-needed states.
- Run logs.
- Approval gating.
- Policy controls.

### Local context storage

Decide:

- Storage engine.
- Indexing strategy.
- Retention defaults.
- Encryption at rest.
- Source exclusion model.
- Backup behavior.

Required:

- Raw capture local by default.
- Pause/resume.
- Redaction.
- Query API for agent.
- Disk usage UI.

### Browser profile storage

Decide:

- Where managed browser profiles live.
- How cookies/session state are encrypted.
- How users reset a site session.
- Whether profiles are per-user, per-workspace, or both.
- Whether cloud browser connections are separate from local managed profiles.

Required:

- Managed browser default.
- Active browser opt-in.
- Immediate stop.
- No silent cookie upload.

### Cloud credits and model cost UX

Decide what users see when work uses:

- Local model/engine.
- Codex-powered engine.
- Basics API credits.
- User API key.
- Cloud automation worker.

Required:

- User should not be surprised by cloud usage.
- Runs should record execution mode.
- Logs should show enough cost/credit metadata for support.

### Admin update flow

Decide:

- Do admins approve desktop app binary updates?
- Do admins approve private app updates?
- Do admins approve cloud worker updates?
- What can individual users install without admin approval?

Recommended:

- Desktop binary updates follow release channel policy.
- Private workspace apps and backend workers go through admin approval.
- User-local developer apps can run locally with clear unsafe/dev labeling.

## Repo Follow-Up

Final app work likely spans multiple repos:

- `thebasicscompany/cloud` - cloud APIs, web prototype, durable automation, private app deployment service.
- `thebasicscompany/client` - final Electron app shell, overlay, IPC, local agent UI.
- `thebasicscompany/lens` - local capture daemon and context distillation.
- `thebasicscompany/agent` - existing backend/API/control-plane pieces that may be reused or retired.
- `thebasicscompany/basics-landing-page` - auth and desktop login bridge.
- `thebasicscompany/architecture` - cross-repo source of truth.
- `thebasicscompany/skills` - reusable skill/tool registry.

## Required Handoff For The Next Engineer

Before starting code work, the next engineer should read:

- `docs/basichome-final-electron-app/README.md`
- `docs/basichome-final-electron-app/01-current-cloud-changes.md`
- `docs/basichome-final-electron-app/02-final-electron-product-target.md`
- `docs/basichome-final-electron-app/03-electron-integration-plan.md`
- `docs/basichome-final-electron-app/04-runtime-api-ipc-contracts.md`
- `docs/DESKTOP-API-REFERENCE.md`
- `PROJECT.md`

Then they should inspect the actual implementation files listed in `01-current-cloud-changes.md`.
