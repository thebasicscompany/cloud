# Basichome Final Electron App

This folder documents what changed on the `codex/basicsHome` cloud branch and what still needs to be built to ship the final Basichome Electron app.

Read this folder before continuing the desktop integration work. The branch contains a strong web/product prototype in `cloud`, but the final product is a native local-first desktop app with cloud promotion, not just a web dashboard.

## Current Branch

- Repo: `thebasicscompany/cloud`
- Branch: `codex/basicsHome`
- Basichome prototype commit: `e060a17 Add Basichome product prototype`
- Product name in app config: `basichome`
- Main web package: `web/`
- New CLI entry: `pnpm basics` -> `scripts/basics-app-cli.mjs`

## What This Folder Answers

- What changed in the cloud branch.
- What the final Electron app should be.
- Which runtime pieces should be local, cloud, or dual-mode.
- What APIs, IPC seams, and services need to exist.
- What needs to be wired before shipping.
- What release checks must pass before claiming production readiness.

## Docs In This Folder

1. [Current Cloud Changes](./01-current-cloud-changes.md)
2. [Final Electron Product Target](./02-final-electron-product-target.md)
3. [Electron Integration Plan](./03-electron-integration-plan.md)
4. [Runtime, API, and IPC Contracts](./04-runtime-api-ipc-contracts.md)
5. [Release Readiness Checklist](./05-release-readiness-checklist.md)
6. [Open Blockers and Owner Decisions](./06-open-blockers-and-decisions.md)

## One Sentence Goal

Basichome should become a local-first AI operating layer for work: it captures useful context on device, lets the user talk to and supervise a local agent, runs browser and app automations locally by default, promotes durable work to Basics Cloud when needed, and records every important action in inspectable logs.

## Important Warning

The Basichome work in this branch is not the final Electron app yet. It is a product-complete web prototype and runtime contract sketch that must be integrated with the desktop client, local Lens capture, local agent harness, browser profile/cookie storage, cloud APIs, approvals, logs, and release packaging.
