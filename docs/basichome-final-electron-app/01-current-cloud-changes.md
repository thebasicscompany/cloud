# Current Cloud Changes

The `codex/basicsHome` branch adds the Basichome product prototype to the existing `cloud` repo. It does not merge into `main`.

## Summary

The branch adds a full web product loop for Basichome:

- Home dashboard.
- Onboarding.
- Local context console.
- Local agent workbench.
- Overlay pill surface.
- Codex engine status and policy settings.
- Browser runtime workbench.
- Cloud automation workbench.
- Apps platform UI.
- Private app CLI.
- Admin approvals.
- Logs and audit.
- Runtime tests and typed data models.

The branch changes 88 files and adds the first version of the Basichome control plane UX.

## Product Surfaces Added Or Changed

### App shell and dashboard

- `web/src/config/app-config.ts`
- `web/src/navigation/sidebar/sidebar-items.ts`
- `web/src/app/(main)/layout.tsx`
- `web/src/app/(main)/_components/home-dashboard.tsx`
- `web/src/app/(main)/_components/app-main-scroll.tsx`
- `web/src/app/(main)/_components/sidebar/app-sidebar.tsx`

These make the app identify as `basichome`, expose the new navigation model, and turn the first screen into a real product dashboard instead of a placeholder.

### Onboarding

- `web/src/lib/onboarding.ts`
- `web/src/app/(main)/_components/onboarding-gate.tsx`
- `web/src/app/onboarding/page.tsx`
- `web/src/app/onboarding/onboarding-flow.tsx`

This creates the first-run flow for local permissions, workspace setup, engine choice, local context setup, and cloud promotion expectations.

### Local context and Lens-style capture

- `web/src/app/(main)/context/page.tsx`
- `web/src/app/(main)/context/_components/context-console.tsx`
- `web/src/hooks/queries/use-local-context.ts`
- `web/src/lib/local-context.ts`
- `web/src/lib/local-context.test.ts`
- `web/src/mocks/local-context.ts`
- `web/src/types/local-context.ts`

This is the UI and local runtime model for context capture. It is currently a web-level prototype and must be wired to the real local Lens daemon for the final Electron app.

### Local agent runtime

- `web/src/app/(main)/_components/local-agent-workbench.tsx`
- `web/src/app/(main)/_components/agent-overlay-pill.tsx`
- `web/src/app/(main)/runs/[runId]/_components/live-view.tsx`
- `web/src/app/(main)/runs/[runId]/_components/run-header.tsx`
- `web/src/app/(main)/runs/_components/runs-table.tsx`
- `web/src/app/(main)/runs/_components/status-options.ts`
- `web/src/app/(main)/runs/_components/status-pill.tsx`
- `web/src/hooks/queries/use-local-agent-runtime.ts`
- `web/src/hooks/queries/use-runs.ts`
- `web/src/lib/local-agent-runtime.ts`
- `web/src/lib/local-agent-runtime.test.ts`
- `web/src/types/local-agent.ts`
- `web/src/types/runs.ts`

This shows how users start, watch, pause, approve, and inspect agent work. For final Electron, this must be backed by desktop IPC and a real local agent harness.

### Codex engine harness

- `web/src/lib/codex-engine.ts`
- `web/src/lib/codex-engine.test.ts`
- `web/src/hooks/queries/use-codex-engine.ts`
- `web/src/types/codex-engine.ts`
- `web/src/app/(main)/settings/_components/developer-settings-view.tsx`

This adds the product model for Codex-powered agent execution: availability, provider selection, policy, and status. Final Electron needs to connect this to the actual installed engine or account-backed execution path.

### Browser runtime

- `web/src/app/(main)/browser/page.tsx`
- `web/src/app/(main)/browser/_components/browser-workbench.tsx`
- `web/src/hooks/queries/use-browser-runtime.ts`
- `web/src/lib/browser-runtime.ts`
- `web/src/lib/browser-runtime.test.ts`
- `web/src/types/browser-runtime.ts`

This models managed local browser tasks and explicit active-browser mode. Final Electron must connect this to a managed browser profile, cookie/session storage, and opt-in active browser control.

### Cloud automations

- `web/src/app/(main)/automations/page.tsx`
- `web/src/app/(main)/automations/[id]/page.tsx`
- `web/src/app/(main)/automations/_components/cloud-automations-workbench.tsx`
- `web/src/hooks/queries/use-cloud-automations.ts`
- `web/src/lib/cloud-automation-runtime.ts`
- `web/src/lib/cloud-automation-runtime.test.ts`
- `web/src/types/cloud-automation.ts`

This is the cloud promotion and durable automation surface. It models scheduled, overnight, long-running, and shared work. Final Electron must connect this to the deployed cloud API.

### Admin approvals

- `web/src/app/(main)/approvals/page.tsx`
- `web/src/app/(main)/approvals/[approvalId]/page.tsx`
- `web/src/app/(main)/approvals/_components/approvals-view.tsx`
- `web/src/app/(main)/approvals/_components/pending-card.tsx`
- `web/src/app/(main)/approvals/_components/resolved-table.tsx`
- `web/src/app/(main)/approvals/_components/approval-detail-page.tsx`
- `web/src/app/(main)/approvals/_components/approval-detail-panel.tsx`
- `web/src/hooks/queries/use-approvals.ts`
- `web/src/lib/admin-approvals-runtime.ts`
- `web/src/lib/admin-approvals-runtime.test.ts`
- `web/src/types/approvals.ts`

This expands approvals from a list into a real approval system: detail views, trust grants, revoke, resolved history, and fail-closed logic.

### Private apps platform and CLI

- `web/src/app/(main)/apps/page.tsx`
- `web/src/app/(main)/apps/_components/apps-overview.tsx`
- `web/src/hooks/queries/use-apps.ts`
- `web/src/lib/workspace-apps-runtime.ts`
- `web/src/lib/workspace-apps-runtime.test.ts`
- `web/src/types/apps.ts`
- `scripts/basics-app-cli.mjs`
- `package.json`

This adds a private app/tool deployment model for company-built apps. The CLI is currently in the cloud repo and should become part of the desktop developer workflow for app init, validation, build, install, publish, approve, deploy, and rollback.

### Logs and audit

- `web/src/app/(main)/logs/page.tsx`
- `web/src/app/(main)/logs/_components/logs-console.tsx`
- `web/src/app/(main)/audit/page.tsx`
- `web/src/hooks/queries/use-platform-events.ts`
- `web/src/lib/platform-events-runtime.ts`
- `web/src/lib/platform-events-runtime.test.ts`
- `web/src/types/platform-events.ts`

This creates the unified event model for agent work, user actions, browser tasks, cloud runs, app deploys, approvals, context events, feedback, and training export previews.

### Config and dependency updates

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `eslint.config.js`
- `web/package.json`
- `web/next.config.mjs`
- `web/src/components/providers/query-provider.tsx`
- `web/src/components/route-placeholder.tsx`
- `web/src/components/ui/drawer.tsx`
- `web/src/lib/supabase/config.ts`
- `web/src/lib/supabase/middleware.ts`

These support the new web prototype and local dev behavior.

## What Is Real Versus Prototype

Real in this branch:

- Product navigation and UX structure.
- Local runtime models.
- Mock/local stores that define data contracts.
- UI states for onboarding, context, local agent, browser tasks, cloud automations, apps, approvals, logs, and settings.
- Tests for core runtime model logic.
- CLI shape for private app lifecycle.

Still prototype or mock-backed:

- Real desktop IPC.
- Real local Lens daemon connection.
- Real local agent execution.
- Real Codex engine execution.
- Real managed browser profile control.
- Real active-browser automation.
- Real cloud API persistence for every new surface.
- Real app deployment packaging and worker hosting.
- Real training/eval export pipeline.

## Verification From The Build Session

The web product loop previously passed:

- `@basics/web` typecheck.
- `@basics/web` tests.
- `@basics/web` lint.
- `@basics/web` build.
- React Doctor `100 / 100`.
- Browser/product walkthroughs for the major UI surfaces.

Because this documentation-only update changes no product code, the required verification for this commit is `git diff --check`.
