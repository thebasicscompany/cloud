# Release Readiness Checklist

Do not claim the final Electron app is ready until this checklist is complete or each exception has a named owner and signoff.

## Product Readiness

- Desktop app launches into Basichome.
- First-run onboarding works from a clean install.
- User can sign in.
- User can switch or confirm workspace.
- User can grant local permissions.
- User can pause and resume capture.
- User can start a local agent run.
- User can cancel a local agent run.
- User can approve or deny a risky action.
- User can run a managed local browser task.
- User can explicitly choose active-browser mode.
- User can promote a task to cloud.
- User can schedule a cloud automation.
- User can inspect run logs.
- User can install a private app.
- User can roll back a private app.
- Admin approval flow is clear on first setup.
- Overlay pill works without blocking the main app.

## Privacy And Trust Readiness

- Raw capture is local by default.
- Capture cannot start before consent.
- User can see capture status at all times.
- User can pause capture from multiple surfaces.
- User can exclude apps, windows, domains, or sources.
- User can inspect what data would be sent to cloud.
- Cloud upload requires approved/distilled/redacted data.
- Training/eval export has preview and consent.
- Browser cookies stay on device unless an explicit cloud browser connection flow is used.
- Active-browser control is impossible without explicit user action.

## Local Runtime Readiness

- Lens daemon starts, stops, and restarts cleanly.
- Context index survives app restart.
- Local agent process health is visible.
- Local agent can query approved local context.
- Local browser profile persists login state.
- Managed browser can be reset.
- Active-browser attachment can be stopped immediately.
- Local logs survive app restart.
- Disk usage is visible.
- Retention cleanup works.

## Cloud Runtime Readiness

- Workspace JWT mint and refresh work.
- Cloud automation list/create/update/run works.
- Run SSE reconnect works.
- Approval stream reconnect works.
- Cloud run cancel works.
- Cloud live view renders when available.
- Cloud failures are visible in Logs.
- Scheduled runs actually fire.
- Durable retries do not duplicate unsafe actions.
- Cloud run costs or credits are visible enough for launch.

## Apps And CLI Readiness

- CLI is packaged or installable.
- App init creates a valid template.
- App check fails invalid manifests.
- App build produces deterministic output.
- App install works locally.
- App publish uploads a versioned bundle.
- Backend worker deployment is handled.
- Approval is required for risky workspace installs.
- Rollback works.
- App logs are visible in the main Logs view.

## Admin And Approval Readiness

- First admin setup is clear.
- Pending approvals appear in main app and overlay.
- Approval detail explains exact action and risk.
- Denial blocks action.
- Expiration blocks action.
- Remember creates a narrow trust grant.
- Revoke takes effect immediately.
- Approval history is visible.
- Policy failures are understandable.

## UI Quality Readiness

- No major screen is blank.
- No route crashes.
- No clipped primary text on laptop or mobile-sized windows.
- No broken hover/focus states.
- No infinite loading states.
- Empty states are useful.
- Error states are useful.
- Animations are lightweight and do not block interaction.
- Overlay does not cover critical controls.
- Keyboard navigation works for approvals and stop/cancel actions.

## Engineering Gates

Run these before release:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

For the web/React surfaces:

```bash
npx -y react-doctor@latest --verbose --diff
```

React Doctor target:

```text
100 / 100
```

For Electron release:

- Desktop unit tests pass.
- Desktop stable integration tests pass.
- Local daemon tests pass.
- Packaging smoke passes.
- Code signing passes.
- Notarization passes.
- Auto-update smoke passes.
- Clean install smoke passes.
- Upgrade from previous version smoke passes.

## Manual QA Scenarios

Run these through the actual product, not just code tests:

1. Clean install -> sign in -> onboarding -> permission setup.
2. Pause capture during onboarding, then resume later.
3. Start local agent run using local context.
4. Trigger an approval and deny it.
5. Trigger an approval and approve it.
6. Create a managed local browser session and log in to a site.
7. Reuse that managed browser session.
8. Try active-browser mode and stop it.
9. Promote a local task to cloud.
10. Schedule a cloud automation.
11. Watch a cloud run stream events.
12. Install a private app with the CLI.
13. Submit an app update for admin approval.
14. Roll back an app.
15. Filter Logs by local agent, browser, cloud, app, approvals, and errors.
16. Restart the app and confirm state is consistent.

## Release Claim Standard

The app is only "production-ready" when:

- Product loops work in the Electron app.
- Local-first privacy behavior is real.
- Cloud promotion is real.
- Logs can prove what happened.
- Admin approval paths fail closed.
- Install/update/rollback are tested.
- Known blockers are fixed or explicitly signed off.
