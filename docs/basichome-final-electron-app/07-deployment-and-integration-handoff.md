# Deployment & Production-Integration Handoff (2026-05-28)

This documents the deploy + production-integration pass on `codex/basicsHome`: the
backend is live on AWS, the web product is themed and product-tested across all
12 goals, and the Basichome UI now displays **real** cloud-agent data plus a
working multi-workspace team/invitations flow.

## Environments

- **AWS account:** `635649352555` (CLI profile `video-app-deploy`).
- **Supabase:** `Basics` project `xihupmgkamnfbzacksja` (us-east-2) — the live
  backend DB. Secrets pulled from Doppler `backend/dev`.
- **Deployed API:** `http://RuntimeApiLoadB-tvxvesbn-1305258267.us-east-1.elb.amazonaws.com`
  (`/health` → 200 `{ok:true, capabilities:{llm_managed_proxy:true}}`).

## SST deploy (Goal 11)

`sst deploy --stage production` (profile `video-app-deploy`) brought up the full
`basics-runtime` stack: VPC + NAT, ECS Fargate API service + ALB + autoscaling,
SQS FIFO `basics-runs.fifo`, EFS workspaces, dispatcher / cron-kicker / pool-
autoscaler Lambdas, ECR `basics-worker`, SES config set, S3 buckets, IAM.

- 21 SST secrets loaded from Doppler via `sst secret load` (mapper:
  `scripts/gen-sst-secrets.mjs`).
- **Cert blocker fix:** `api.trybasics.ai` DNS is external (Vercel) with no
  Route53 zone, so DNS-validated ACM can't auto-validate and a domain deploy
  would hang. `sst.config.ts` now makes the custom domain **opt-in**:
  - Default: ALB serves HTTP on port 80 at its AWS DNS name (no cert).
  - `DEPLOY_API_DOMAIN=1` (+ optional `API_CERT_ARN` for a pre-validated cert)
    switches the ALB to HTTPS on `api.trybasics.ai`.
  - A cert was pre-requested: `arn:aws:acm:us-east-1:635649352555:certificate/c375d77b-7411-4352-87cb-6c6ae7374a40`.
    To finish the domain, add at Vercel: (1) the ACM validation CNAME
    `_8ef97a584a5e8a37d616aae5aa94ce80.api` → `_5754108f53e26cf24a2184388250f4fe.jkddzztszm.acm-validations.aws`,
    and (2) `api` CNAME → the ALB DNS name. Then redeploy with
    `DEPLOY_API_DOMAIN=1 API_CERT_ARN=<arn>`.

## Design system (basicsOS)

`web/src/app/globals.css` `:root` retuned to the basicsOS palette: `#f3f3f3`
canvas, near-black ink/primary, white framed surfaces, DM Sans, 8px radius,
green reserved as a success accent. shadcn token structure kept intact.

## Production integration: live Agent surface (Goal 11)

New `/agent` route reads the real opencode self-healing worker data from Supabase
via a server-only service-role client (`web/src/lib/supabase/admin.ts`,
`web/src/lib/agent-data.ts`), with a **workspace switcher** that scopes every
panel per workspace:

- Skills (`cloud_skills`), helper modules (`cloud_agent_helpers`),
  managed-browser cookie sessions (`workspace_browser_sites` +
  `cloud_session_bindings`), Composio/direct-auth connections
  (`workspace_credentials` + `composio_tool_cache`).
- **Redaction:** `storage_state_json` (cookies) and `ciphertext` (secrets) are
  never selected, so they can't reach the renderer (verified — no leak in DOM).
- Verified scoping: All=7 skills/467 sessions/36 conns; ws `aa9dd140`=4 skills;
  ws `0b86dc25`=3 skills.

## Team, invitations & multi-seat

- Additive migration `add_workspace_invitations` (table + RLS, service-role
  policy) applied to the Basics project.
- `/team` route: workspace switcher, members table, pending invitations, invite
  form. Routes `/api/team/{invite,accept,revoke}`; public accept page
  `/invite/[token]`. Email via the production-verified SES identity
  (`web/src/lib/email-invite.ts`, `@aws-sdk/client-sesv2`).
- **End-to-end proof:** invited `dmrknife@gmail.com` to two workspaces → real
  SES emails delivered (messageIds returned) → accepted → account
  find-or-created → memberships added. That account is now in **3 workspaces**
  (owner/member/admin), proving multi-workspace membership + switching.
- SES is production-grade: `ProductionAccessEnabled=true`, `trybasics.ai`
  verified, DKIM SUCCESS, 50k/day.

## Per-goal status (all product-tested via browser harness)

| Goal | Status | Evidence |
| --- | --- | --- |
| 1 Shell/Home/nav | ✅ | Home dashboard + all routes render; Agent + Team added |
| 2 Onboarding/permissions | ✅ | 6-step wizard completed → cockpit |
| 3 Lens context | ✅ | privacy boundary; pause→resume toggles |
| 4 Local agent runtime | ✅ | start run → pause/resume/stop/promote; run detail |
| 5 Codex engine | ✅ | Ready/connected/auth-expired/not-installed; simulate + recover |
| 6 Browser runtime | ✅ | managed-local run → Watch/Take over/Stop/Promote; 3 modes |
| 7 Cloud automations | ✅ | run-now + grant/revoke trust |
| 8 Private apps CLI | ✅ | init→check(fail-closed)→build→install→publish→approve→update→rollback→logs |
| 9 Admin approvals | ✅ | approve → Pending 1 / Approved 2 |
| 10 Unified logs | ✅ | 13k+ events; feedback label applied |
| 11 Production integration | ✅ | SST deploy live; Supabase live; real Agent data; Team/invitations |
| 12 Release bar | ✅ | typecheck/test/lint/build pass; React Doctor 100/100 |

Screenshots: `basicsHome/docs/screenshots/goal-run-20260528/`.

## Honest remaining work

- **Custom API domain** `api.trybasics.ai` — one redeploy away (needs the two
  Vercel DNS records above).
- **Worker image** not yet pushed to ECR, so cloud agent *runs* dispatched via
  SQS won't execute until the `basics-worker` image is built/pushed (the API,
  control plane, and all data surfaces are live).
- **Goals 1–10 mock surfaces** (context/agent/browser/automations/approvals/
  logs) remain local/mock-backed by design; the genuinely cloud-wired surfaces
  are Agent (real Supabase), Team/invitations (real Supabase + SES), and the
  deployed API. Full API-backed replacement of the remaining mock stores is the
  next integration phase.
- **Electron packaging** (native shell, signing, notarization, Lens daemon)
  per the other docs in this folder — out of scope for this web+cloud pass; the
  web renderer is the test surface.
