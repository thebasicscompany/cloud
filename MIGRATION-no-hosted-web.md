# Migration: no hosted web — Electron-only renderer + `cloud/api` backend

**Goal:** the desktop (Electron) app is the only thing users run. No public web
domain, no hosted Next.js dashboard. The backend (`cloud/api` Hono on Fargate),
the websocket relay, and the worker stay hosted. **Lose no functionality. Close,
don't carry over, security gaps.**

This is aligned with the intended design — `sst.config.ts` already states
*"No web dashboard, no `app.trybasics.ai`."* `cloud/web` was a dev-convenience
renderer + a dev-grade API layer. We finish the intended split.

## Key finding (why this is small, not a 44-route port)

`cloud/api` **already** has secure, `requireWorkspaceJwt`-authed equivalents for
almost every `cloud/web` `/api/*` route. The web routes are **dev duplicates**
that use the **service-role admin client + hardcoded `PRIMARY_WORKSPACE_ID`**
(no real per-user auth — the security gap). Real auth already exists too:
`POST /v1/auth/token` (Supabase access-token → 24h workspace JWT) + `/v1/auth/refresh`.

So the migration is mostly: **repoint the renderer/desktop at the existing
`/v1/*` routes with a real workspace JWT, then delete the web dev routes.** Only
a few routes are genuinely unique and need adding to `cloud/api`.

## Route map (web `/api/*` → cloud/api `/v1/*`)

| web route | disposition |
|---|---|
| `runs` (list/[id]/steps/message/outputs/live-view/connection-needs) | repoint → `/v1/runs/*` (cloud-runs, outputs-sse) |
| `runs/trigger`, `trigger-local`, `trigger-compute` | repoint → `/v1/runs` + worker enqueue (verify coverage) |
| `approvals`, `approvals/[id]` | repoint → `/v1/approvals/*`, `/v1/workspaces/:ws/approvals/stream` |
| `automations` (+[id], run) | repoint → `/v1/automations/*` |
| `browser-sites/*` | repoint → `/v1/workspaces/:ws/browser-sites*` |
| `voice/token` | repoint → `/v1/voice/*` |
| `connections`, `connections/connect` | repoint → `/v1/skills` (composio) + `/v1/workspaces/:ws/credentials` |
| `apps/*`, `documents/*` | repoint → `/v1/assistants/:id/apps`, `/documents` |
| `settings/*`, `team/*`, `pending-actions`, `logs`, `suggestions/*`, `routines/record` | verify vs platform/contexts/assistant-compat; migrate any gap |
| **`computer-use/next`** | **NEW** → `POST /v1/computer/next` (DONE) |
| **`computer-use/[id]/result`** | **NEW** → `POST /v1/computer/:id/result` (DONE) |
| **`computer-use/recipe`** | **NEW** → `GET/POST /v1/computer/recipe` (DONE) |
| **`lens/context`** | **REMOVE** — replaced by real auth: client Supabase session → `/v1/auth/token` → JWT; `apiBase` becomes a client config constant |

**Security fix in the new queue/recipe endpoints:** the web versions trusted a
client-supplied `workspaceId` in the body (cross-workspace hole). The cloud/api
versions take the workspace from the **verified JWT** (`c.var.workspace`),
never the body — a token can only touch its own workspace's queue.

## Auth wiring (the linchpin)

- Electron renderer signs in with Supabase (existing session) → `POST /v1/auth/token`
  → 24h workspace JWT. Stored securely; refreshed via `/v1/auth/refresh`.
- Main process receives the JWT (IPC) and the loops (`computer-watcher`,
  `computer-loop`, `lens-client`) send it as `X-Workspace-Token` to `cloud/api`.
- `apiBase` = `cloud/api` URL from a build/env constant (was: `lens/context.apiBase`).
- **No `WORKSPACE_JWT_SECRET`, no service-role key, ever in the desktop bundle.**

## Stages / status

1. ✅ **Design** (Task #67) — documented above.
2. ✅ **Unique routes added to cloud/api** (Task #69) — `POST /v1/computer/next`,
   `POST /v1/computer/:id/result`, `GET/POST /v1/computer/recipe` in
   `api/src/routes/computer-use.ts`, JWT-scoped (security fix vs the web versions'
   client-supplied `workspaceId`). **`pnpm typecheck` clean.**
3. ✅ **Desktop staged** (Task #71, desktop half) — `desktop/auth-context.js`
   (renderer-fed JWT, decode-only, no secret) + loops (`computer-watcher`,
   `computer-loop`, `lens-client`) read context from it. Queue/recipe prefer
   cloud/api with a transitional web fallback. **Gated OFF by
   `BASICS_USE_CLOUD_QUEUE` → zero behavior change until activated.** IPC bridge
   (`basichome:auth:set/clear`) + `preload.setWorkspaceToken/apiBase` ready for
   the renderer. All six files `node --check` clean. **Nothing deleted — the
   current web flow is fully intact as the fallback.**

### Activation (after this commit, in order — each verifiable)
4. ⏳ **Deploy cloud/api** (carries the queue/recipe endpoints + computer-use
   metering). Then set `BASICS_USE_CLOUD_QUEUE=1` for the desktop and E2E-verify
   the computer-use queue + recipe against cloud/api (the orchestration tests).
5. ⏳ **Renderer bridge** (Task #71, renderer half) — a client component
   (env-gated, e.g. `NEXT_PUBLIC_DESKTOP_AUTH_BRIDGE=1`) that exchanges the
   Supabase session → `/v1/auth/token` → JWT → `window.basichome.setWorkspaceToken`.
   Verify the resolved workspace == the operator workspace before flipping (so
   Lens distill keeps landing in the same workspace).
6. ⏳ **Renderer data layer → `/v1/*`** (Task #70) — repoint `@/lib/*-data` +
   client fetches to cloud/api with the JWT. **Mostly repointing to EXISTING
   secure routes** (runs, approvals, automations, browser-sites, voice, apps,
   documents, connections...), not porting. Per-route map in the table above.
7. ⏳ **Bundle renderer into Electron** (Task #72) — Next standalone served
   locally in the main process; load it as the renderer. No hosted web.
8. ⏳ **Delete web dev routes** — `lens/context`, `computer-use/*`, and every
   route now served by cloud/api. Remove `getAdminClient` + `PRIMARY_WORKSPACE_ID`
   from all client-reachable code.
9. ⏳ **Security review** (Task #73) — no service-role key / JWT secret in the
   bundle; every route JWT-scoped; CORS locked.
10. ⏳ **Full E2E re-test** (Task #74).

**Invariant held so far:** every change is additive or flag-gated. The hosted
web + its dev routes still serve the app exactly as before; the new secure path
turns on only when explicitly activated (deploy + flag), so no functionality is
lost and nothing ships half-migrated.

## Deploy-readiness findings (2026-05-30)

Deploying `cloud/api` is **not** a targeted endpoint push — it's a release, and
it's currently blocked. Findings:

- **Trigger = push to `main`** (`.github/workflows/deploy-production.yml`), which
  promotes **all 29 commits** on `codex/basicsHome` (the whole computer-use /
  lens / automations line) to production + runs `db:migrate` + builds/pushes the
  worker image + `sst deploy --stage production`. main is 0 behind (clean ff).
- **The CI `lint` gate FAILS** (6 pre-existing `web/` errors — CI only runs on
  `main`, so the branch was never gated):
  - 5× "Definition for rule was not found" — `eslint-disable` directives for
    `react-hooks/exhaustive-deps` + `@next/next/no-img-element`, plugins the flat
    `eslint.config.js` doesn't load (apps-overview, browser-workbench,
    documents-overview, pill/page, connection-logo).
  - 1× real `@typescript-eslint/no-unused-expressions` — `web/.../pill/page.tsx:57`.
  - **Must be fixed before any deploy** (config decision — your call).
- **Two Supabase projects:** active = **`Basics` `xihupmgkamnfbzacksja` (us-east-2)**
  (has the recent schema); `bascisos` (us-east-1) is older and lacks it. Confirm
  the api's `SUPABASE_URL` points at `Basics`.
- **`computer_use_requests` / `computer_use_recipes` are untracked** (no `.sql`
  migration; created ad-hoc). They EXIST in `Basics`, so the deploy won't break,
  but add a tracked drizzle migration. Live schema:
  - `computer_use_requests(id uuid pk default gen_random_uuid, workspace_id uuid
    not null, run_id uuid, session text, task text not null, status text not null
    default 'pending', result jsonb, created_at timestamptz default now,
    updated_at timestamptz default now)`
  - `computer_use_recipes(id uuid pk, workspace_id uuid not null, signature text
    not null, title text not null default '', approach text not null, app_hint
    text, success_count int not null default 1, created_at timestamptz default
    now, last_used_at timestamptz default now)`

**Unblock order:** fix the 6 web lint errors → confirm api → `Basics` →
(optionally) add `0034_computer_use.sql` to the drizzle schema → ff `main` →
deploy → `BASICS_USE_CLOUD_QUEUE=1` → E2E → renderer/bundling stages.
