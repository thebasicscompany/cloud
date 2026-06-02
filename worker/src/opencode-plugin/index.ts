// G.1b / H.2 — opencode plugin that registers our 32 Browserbase tools.
//
// This module is loaded by opencode at session boot via OPENCODE_CONFIG_CONTENT
// pointing at a bundled file. The plugin owns:
//   - Browserbase session lifecycle (create on first tool call, stop on close)
//   - CDP attach via @basics/harness
//   - Publisher writes to agent_activity (tool_call_start / _end / screenshot)
//   - Per-opencode-session ctx keyed off ToolContext.sessionID (H.2)
//
// Resolution order for {workspaceId, runId, accountId}:
//   1. opencode_session_bindings table by sessionID (H.3 pool flow)
//   2. process.env RUN_ID/WORKSPACE_ID/ACCOUNT_ID (G.1b 1:1 fallback)
//
// Other env always read from process.env (platform-wide):
//   BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, DATABASE_URL_POOLER

import { type Plugin, tool } from "@opencode-ai/plugin";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import postgres from "postgres";
import { attach as cdpAttach, detach as cdpDetach, type CdpSession } from "@basics/harness";
import {
  buildWorkerToolRegistry,
  type WorkerToolContext,
} from "../tools/index.js";
import { Publisher } from "../publisher.js";
import {
  createBrowserbaseSession,
  stopBrowserbaseSession,
  type BrowserbaseSession,
} from "../browserbase.js";
import { PgSkillLoader, composeSkillContext, type LoadedSkill } from "../skill-loader.js";
import { PgSkillStore } from "../skill-store.js";
import { PgQuotaStore } from "../quota-store.js";
import { resolveConnectedAccounts, resolveEnabledToolkits } from "../composio/connection-resolver.js";
import { PgComposioToolCache } from "../composio/cache.js";
import { loadComposioPolicy } from "../composio/denylist.js";
import { executeWithApproval } from "../approvals/with-approval.js";
import { DryRunBuffer, flushBuffer as flushDryRunBuffer } from "../dry-run/interceptor.js";
import type { ToolResult } from "@basics/shared";

interface PluginRuntime {
  ctx: WorkerToolContext;
  publisher: Publisher;
  bb: BrowserbaseSession;
  session: CdpSession;
  bbApiKey: string;
  bbProjectId: string;
  skills: ReadonlyArray<LoadedSkill>;
  /** K.6 — agent-authored helpers visible to this run, injected into system prompt. */
  helpers: ReadonlyArray<LoadedHelperSummary>;
  /** App surfaces this workspace has, injected so the agent can app_emit/app_query. */
  apps: ReadonlyArray<AppSummaryForPrompt>;
  /** Hosts with a saved cloud browser login (cookies), injected so the agent
   * knows which gated sites it's already signed into and which to request. */
  browserSites: ReadonlyArray<string>;
  /** Toolkit slugs the ORG has enabled in Composio (connectable via Composio),
   * so the agent tells "ask to connect via Composio" from "use the browser". */
  enabledToolkits: ReadonlyArray<string>;
  /** True when this run drives the user's local machine (relay bridged), so
   * computer_use is actually available. Gates the computer-use prompt rung. */
  isLocal: boolean;
  sessionID: string;
  workspaceId: string;
  runId: string;
  /** C.4 — tx-mode pg (port :6543) used for INSERT/SELECT + approval_rules lookup. */
  quotaSql: ReturnType<typeof postgres>;
  /** C.4 — session-mode pg (port :5432) used for LISTEN on approval channels. */
  listenSql: ReturnType<typeof postgres>;
}

interface LoadedHelperSummary {
  name: string;
  description: string;
  args_schema: Record<string, unknown>;
  helper_version: number;
  automation_id: string | null;
}

/**
 * K.6 — load active helpers for the workspace (and optionally
 * automation-scoped helpers). Returns name + description + args_schema
 * only — bodies are loaded fresh on each helper_call invocation so
 * agents that supersede mid-run pick up the new version.
 */
async function loadHelpersForRun(
  sql: ReturnType<typeof postgres>,
  workspaceId: string,
  automationId: string | null,
  limit = 30,
): Promise<LoadedHelperSummary[]> {
  const rows = await sql<LoadedHelperSummary[]>`
    SELECT name, description, args_schema, helper_version,
           automation_id::text AS automation_id
      FROM public.cloud_agent_helpers
     WHERE workspace_id = ${workspaceId}::uuid
       AND active = true
       AND (automation_id IS NULL ${automationId ? sql` OR automation_id = ${automationId}::uuid` : sql``})
     ORDER BY (automation_id IS NOT NULL) DESC, name ASC
     LIMIT ${limit}
  `;
  return rows;
}

function composeHelperContext(helpers: ReadonlyArray<LoadedHelperSummary>): string {
  if (helpers.length === 0) return "";
  const lines = helpers.map((h) => {
    const argsLine = Object.keys(h.args_schema).length > 0
      ? `  args_schema: ${JSON.stringify(h.args_schema)}`
      : "  args_schema: {}";
    return `- ${h.name} (v${h.helper_version})${h.automation_id ? " [automation-scoped]" : ""}\n    ${h.description}\n${argsLine}`;
  });
  return `<helpers>
The workspace has the following agent-authored helpers. Prefer \`helper_call({helperName, args})\` over re-deriving these pipelines by hand when the args shape matches. On throw/error, call underlying tools directly then helper_write with supersedes_helper_id.

${lines.join("\n")}
</helpers>`;
}

interface AppSummaryForPrompt {
  slug: string;
  name: string;
  kind: string;
  field_keys: string[];
}

function composeAppsContext(apps: ReadonlyArray<AppSummaryForPrompt>): string {
  const lines = apps.length
    ? apps.map(
        (a) => `- ${a.slug} — "${a.name}" (${a.kind})${a.field_keys.length ? `; fields: ${a.field_keys.join(", ")}` : ""}`,
      )
    : ["- (no apps yet — create one with app_emit using appName+appKind when output is structured/repeating)"];
  return `<outputs>
PERSIST YOUR OUTPUT — returning text is not enough. A run's final text goes into the run log, which users don't browse. Anything a user would want to keep, re-read, find later, or act on MUST be written to a durable surface before you finish. Treat persisting as part of doing the task, not an afterthought.

Pick the surface:
- Structured or repeating data (a lead, a row, a tracked item, a metric, an entry that accrues over time) ⇒ an APP via \`app_emit({appSlug, data, status?, dedupKey?})\`. Strongly prefer an App for anything that could recur — it turns your runs into a living dataset the user can sort, filter, and build on.
  • First \`app_query({appSlug})\` a fitting app from the list below and ADD this run's records to it.
  • If no app fits and the output is structured/recurring, CREATE one — call \`app_emit\` with appName+appKind for a new slug. Creating an app is encouraged, not a last resort. If you can imagine this run happening again (a daily check, a scheduled task, a repeated lookup), make an app for it now.
  • EMPTY RESULTS STILL CREATE THE APP. If your output is an app but you found NO data this run (a sync that returned nothing yet, a search with no hits), STILL create it — call \`app_emit\` with appName + appKind + \`fields\` (the columns) and OMIT \`data\`. A missing app means future runs have nowhere to write and the user can't see the automation set up its output; an empty app with the right columns is the correct, ready state.
- Long-form / narrative (a report, summary, digest, plan, brief, drafted message) ⇒ a DOCUMENT via \`doc_write({title, body, summary?, dedupKey?})\` (markdown).

ACCUMULATE across runs. This run may be one of many — a manual re-run, a scheduled/cron automation, or a task the user repeats. Do NOT start fresh each time:
- Read what prior runs produced (\`app_query\`, or update the same Document by stable dedupKey) and APPEND/UPDATE the same surface rather than creating a new one each run.
- Use a stable dedupKey tied to the record's identity so re-runs update in place instead of duplicating, and new items get added.
- For a scheduled or repeating automation, EVERY run should leave the surface richer than it found it — a new row in its App, or its Document brought up to date.

Only skip persistence for genuinely trivial/conversational answers. Always also return a short summary as your final answer.

Apps available in this workspace:
${lines.join("\n")}
</outputs>`;
}

function composeBrowserSitesContext(hosts: ReadonlyArray<string>): string {
  const saved = hosts.length ? hosts.map((h) => `- ${h}`).join("\n") : "- (none saved yet)";
  return `<browser_sites>
This run's cloud browser already has a saved login (cookies) for these hosts — navigate to them and you are authenticated:
${saved}

YOU must figure out which logins a task needs — the user will NOT spell it out. Before acting, infer the site(s) the goal implies and whether they need a signed-in session:
- Phrasing like "my …", "my account", a personal feed/inbox/dashboard/DMs/history/subscriptions/orders, or anything user-specific ⇒ that site needs a login. (e.g. "my YouTube subscriptions" ⇒ youtube.com login; "my Gmail" ⇒ Gmail; "my LinkedIn messages" ⇒ linkedin.com.)
- Public, non-personalized info (search results, public pages, prices) ⇒ usually no login.

For each needed site: if it's in the saved list above, just use it. If it is NOT, do NOT type a password and do NOT treat a sign-in wall as a dead end — and do NOT fabricate results. Instead, CALL the \`request_browser_login({host, reason})\` tool — this surfaces a one-click "Sign in to <host>" prompt to the user on the run and on their Home screen (without it, the user never sees that a login is needed). Then stop and tell them to connect it and re-run. At RUNTIME, also treat any logged-out signal (a sign-in/login wall, a "Sign in" call-to-action, or the absence of the user's personalized content) as exactly this — call request_browser_login and stop, never guess around it.

When SETTING UP a new automation, enumerate every gated site it will touch up front — alongside any Composio connections — so the user can connect them before the first run. Missing browser logins are first-class setup requirements, same priority as Composio connections.

HOST SPECIFICITY: use the EXACT host a task lives on, INCLUDING subdomain. Many apps run on a subdomain — the Stripe dashboard is dashboard.stripe.com (NOT stripe.com), HubSpot is app.hubspot.com, etc. A login is per-host: stripe.com cookies do NOT sign you into dashboard.stripe.com. Always request_browser_login for the precise host you navigate to. And if a SAVED login STILL shows a sign-in wall, the saved login is for the WRONG host — re-request request_browser_login for the EXACT host you're on (the subdomain), not the bare domain, then stop.
</browser_sites>`;
}

function composeToolStrategyContext(isLocal: boolean): string {
  // Reliability + cost ladder (cf. Clicky's "computer-use as last-mile fallback").
  // Prefer structured APIs over the browser, and the browser over screen control.
  // The computer-use rung is shown ONLY on local runs — on a cloud run there's
  // no desktop to drive, so offering it would just mislead the agent.
  const computerRung = isLocal
    ? `3. Computer-use LAST — the \`computer_use({task})\` tool drives the user's REAL machine (mouse + keyboard, any app). This is a LOCAL run, so it's available. Reach for it only when neither an API nor a browser flow can: a NATIVE desktop app, an OS dialog, or a non-browser UI. Hand it a clear, self-contained task and let it run.`
    : `3. (Computer-use is NOT available on this run — it's a cloud run with no desktop to drive. Solve it with an API or the browser, or tell the user it needs a local run.)`;
  return `<tool_strategy>
Choose the most reliable, lowest-cost path that can do the job — escalate only when the simpler one can't:
1. Structured API tools first — Composio actions (Gmail, Sheets, Calendar, etc.) and helper SQL/code. Deterministic, fast, no UI brittleness. If a connected toolkit can do it, use it.
2. Browser second — only when there is no API for the task (a site with no integration). Reuse a saved <browser_sites> login; never re-derive what an API tool already returns. Click visible UI and type into fields with the browser tools.
${computerRung}
Don't open a browser to do something an API tool already does. Don't screen-drive what a browser can do with a URL + selector. State which rung you chose and why when it isn't obvious.
</tool_strategy>`;
}

function composeAutonomyContext(): string {
  // The whole product is "low human-in-the-loop": the agent decides and acts;
  // humans only review the result and correct course after the fact. A headless
  // cloud run has NO channel to answer a question (opencode's stdin is ignored),
  // so any question hangs the run. This directive makes the agent never ask.
  return `<autonomy>
You are running AUTONOMOUSLY in the cloud — headless, with NO human watching and NO way to answer a question. Stopping to ask anything HANGS the run; it never reaches a person. So:
- NEVER ask the user a question, ask for clarification, or wait for confirmation/input. If you catch yourself wanting to ask, instead MAKE THE BEST DECISION yourself from sensible defaults and proceed. Acting on a reasonable assumption always beats stopping to ask.
- Do NOT seek permission for routine work. Choose an approach, do it, verify the result, and report. Humans review the OUTPUT afterward and correct course if needed — that is the ONLY point a human enters the loop.
- A SMALL MISMATCH between the user's phrasing and the actual content of a page/dataset is NOT a blocker. Reinterpret to the nearest reasonable thing and proceed. Examples: "rank the startups on YC RFS" → that page lists RFS *categories/ideas*, so rank those. "Find 10 competitors" but only 4 exist → list the 4. "Update the spreadsheet" but the doc is a Notion table → update the table. Stopping to explain that the user's noun was slightly off is the EXACT FAILURE MODE this directive forbids — writing a clarification answer instead of doing the work counts as bailing. Reframe silently and do the task.
- The ONLY acceptable early stop is a hard external blocker you cannot work around: a gated site you must be signed into but aren't (call \`request_browser_login({host, reason})\`), or a required connection/credential that does not exist. Surface it with the proper tool, write up what you DID accomplish, then finish — never wait.
- Bias hard toward finishing the task end-to-end on your own judgment. A completed run on a reasonable decision is the goal; a run that stalls asking what to do is a failure.

NEVER FABRICATE. The most dangerous failure mode is "I can't reach the source so I'll write a plausible-sounding paragraph from training-data intuition instead." That is FORBIDDEN. The user trusts that every fact in your output came from work you did THIS run, not from what the model guessed. Concretely:
- If a section of the task needs a gated site you can't reach (x.com / twitter.com / linkedin.com / a paywalled article / a logged-out app), you MUST call \`request_browser_login({host, reason})\` for that host. Do not work around it by inventing content.
- If you would not be able to point to a specific tool call (a screenshot, a \`js\` extraction, a \`composio_call\` result, a SQL row) that produced a fact, you must NOT write that fact as a fact. Either omit it or caveat it explicitly ("could not verify — no [X] access on this run").
- Forbidden examples: writing a "Twitter Signal Analysis" section when you never loaded x.com; listing "10 competitors per category" when you only searched for #1; quoting a "$50B market size" with no source. If you produce any of these, you have lied to the user and the run is a failure even if it returned "complete".

ENUMERATE LOGINS UP FRONT. Before starting work, walk through the WHOLE task and identify every gated site/connection it will need. Call \`request_browser_login({host, reason})\` for EACH missing one in this SAME run — one call per host. Don't discover a login gap halfway through and silently fill it with guesses; that is fabrication.

DO NOT REFERENCE \`/workspace/\` PATHS IN USER-VISIBLE OUTPUT. The container's \`/workspace/\` directory is ephemeral scratch — gone when the worker idle-stops. The user cannot open /workspace/anything from their app. If you produced a document, use the \`doc_write\` tool (it lands in the user's Documents area and persists) and reference THAT by title/slug. Phrases like "saved locally at /workspace/foo.md" or "you can find the file at /workspace/..." are misleading and forbidden.

FILE FORMAT REQUESTS → \`doc_write\`, NEVER raw files. When the user asks for a markdown / .md / docx / .docx / pdf / .pdf / .csv / "file" / "spreadsheet" output, do NOT \`bash\` a heredoc into /workspace, do NOT \`write_file\` into the container fs — that's all ephemeral scratch the user can't reach. Instead: call \`doc_write({title, body})\` with the content as markdown. Then tell the user: "I created a Basics document called \"<title>\" — open the Documents area to view and download it as .md / .docx / .pdf." The Documents area has a built-in Download button that exports the doc in the format they asked for. \`doc_write\` is the ONLY persistent output channel for produced files; \`/workspace\` is invisible to the user.

EVERY RESEARCH/REPORTING TASK MUST END WITH A "Sources" section that lists every URL you actually fetched and every tool call result you relied on. If a section of the report has no underlying source (gated, ran out of time, etc.), state that explicitly in the section itself. The Sources section is mandatory; its absence is itself evidence of fabrication and will fail the run.
</autonomy>`;
}

function composeConnectionsContext(
  connectedToolkits: ReadonlyArray<string>,
  enabledToolkits: ReadonlyArray<string>,
): string {
  const connected = connectedToolkits.length ? connectedToolkits.join(", ") : "(none connected yet)";
  const connectable = enabledToolkits.filter((t) => !connectedToolkits.includes(t));
  const connectableLine = connectable.length
    ? connectable.slice(0, 40).join(", ") + (connectable.length > 40 ? `, …(+${connectable.length - 40} more)` : "")
    : "(none)";
  return `<connections>
Composio status for this workspace:
- CONNECTED — use immediately via composio_call: ${connected}.
- CONNECTABLE — your org enabled these in Composio but the user hasn't connected them yet; composio_call will surface a one-click "Connect" prompt: ${connectableLine}.
- Anything in NEITHER list is NOT available through Composio in this org — use the BROWSER for it.

When a task needs a third-party service, decide the path yourself — never ask "is X connected?":
1. CONNECTED toolkit → use composio_call directly.
2. CONNECTABLE toolkit (org-enabled, not yet connected) → use composio_call; when it reports no connection it surfaces a clear "Connect <service>" prompt to the user. That is the correct ask for these.
3. NEITHER (e.g. Stripe — not enabled in this org's Composio) → do NOT try to force a Composio connection and do NOT dead-end on a "no enabled auth config found for toolkit" error. Use the BROWSER: navigate to the service's own site and do the task; if it needs a sign-in this run lacks, call request_browser_login({host, reason}) with the real host (e.g. 'stripe.com'). Then write up what you did and finish.

ENUMERATE UP FRONT: before you start the work, think through the WHOLE task and identify EVERY connection it will need — there may be several (e.g. a task that touches Stripe AND YouTube needs a Stripe browser login AND a YouTube login). Request ALL the missing ones in THIS run, together — one request_browser_login per gated site, and composio_call for each connectable toolkit — so they all surface at once and the user connects everything in a single pass. NEVER request one, stop, and only discover the next on a re-run. Don't ask for anything that already shows as connected/logged-in. Once you've surfaced every missing connection, write what you could do and finish.
</connections>`;
}

// H.2 — per-opencode-session runtime cache. Keyed by ToolContext.sessionID
// so multiple sessions in the same opencode-serve process get isolated
// Browserbase sessions, publishers, and skill contexts.
const runtimeBySession = new Map<string, Promise<PluginRuntime>>();

function readEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`opencode-plugin: missing env ${key}`);
  return v;
}

/** Like readEnv but returns undefined instead of throwing — used by the
 * 1:1 `WORKSPACE_ID/RUN_ID/ACCOUNT_ID` fallback path in resolveBinding,
 * where missing env is the EXPECTED state for pool-host launches. */
function optionalEnv(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

interface SessionBinding {
  workspaceId: string;
  runId: string;
  accountId: string;
  /** Set when the run originated from an automation (D.3/D.5/D.6). Used
   * by the C.3 approval-rule lookup so per-automation remember rules
   * match correctly. */
  automationId?: string;
  /** E.7 — when true, mutating-outbound tools are intercepted into
   * dry_run_actions instead of executing. Sourced from cloud_runs.dry_run. */
  dryRun?: boolean;
  /** Model B — 'cloud' (Browserbase, default) or 'local_relay' (drive the
   * user's local Chrome through the relay). Sourced from cloud_runs. */
  browserTarget?: string;
  /** Model B — per-run relay session id pairing this worker to the desktop. */
  relaySession?: string;
  /** Model B — when true, screenshots are not persisted (ephemeral). */
  ephemeral?: boolean;
}

/** Resolve sessionID → {workspaceId, runId, accountId}. Tries the bindings
 * table first (H.3 pool flow); falls back to process.env (G.1b 1:1).
 *
 * Retries the DB lookup with backoff because the pool host inserts the
 * binding row AFTER `POST /session` returns (worker/src/main.ts:564-565),
 * and opencode-serve fires plugin hooks (e.g. `system-transform`) the
 * moment the session is observable — so the first hook for a new session
 * can race ahead of the binding write. 10 × 250ms = ~2.5s window, plenty
 * to absorb the race without making boot feel sluggish.
 *
 * Falls back to env ONLY when all three of WORKSPACE_ID/RUN_ID/ACCOUNT_ID
 * are present (legacy G.1b 1:1 mode). For pool-host launches none of those
 * are set by the dispatcher (worker/dispatcher/handler.ts:185-197), so the
 * fallback is a no-op and we throw a clear diagnostic message after the
 * retries instead of a cryptic "missing env" three frames deeper.
 */
async function resolveBinding(
  databaseUrl: string,
  sessionID: string,
): Promise<SessionBinding> {
  const MAX_ATTEMPTS = 10;
  const RETRY_MS = 250;
  let lastDbError: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const sql = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
    try {
      const rows = await sql<
        Array<{
          workspace_id: string;
          run_id: string;
          account_id: string;
          automation_id: string | null;
          dry_run: boolean | null;
          browser_target: string | null;
          relay_session: string | null;
          ephemeral: boolean | null;
        }>
      >`
        SELECT b.workspace_id, b.run_id, b.account_id, r.automation_id, r.dry_run,
               r.browser_target, r.relay_session, r.ephemeral
          FROM public.cloud_session_bindings b
          LEFT JOIN public.cloud_runs r ON r.id = b.run_id
         WHERE b.session_id = ${sessionID}
         LIMIT 1
      `;
      if (rows[0]) {
        const binding: SessionBinding = {
          workspaceId: rows[0].workspace_id,
          runId: rows[0].run_id,
          accountId: rows[0].account_id,
        };
        if (rows[0].automation_id) binding.automationId = rows[0].automation_id;
        if (rows[0].dry_run === true) binding.dryRun = true;
        if (rows[0].browser_target) binding.browserTarget = rows[0].browser_target;
        if (rows[0].relay_session) binding.relaySession = rows[0].relay_session;
        if (rows[0].ephemeral === true) binding.ephemeral = true;
        return binding;
      }
    } catch (e) {
      // Real DB error (not "row not found") — stop retrying. The env
      // fallback may still rescue us in 1:1 mode.
      lastDbError = e;
      console.error("plugin: cloud_session_bindings lookup error; not retrying", e);
      await sql.end({ timeout: 2 }).catch(() => undefined);
      break;
    }
    await sql.end({ timeout: 2 }).catch(() => undefined);
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
  // 1:1 env fallback. All three must be present together — partial state
  // is broken and we'd rather fail clearly than start a session with the
  // wrong workspace.
  const workspaceId = optionalEnv("WORKSPACE_ID");
  const runId = optionalEnv("RUN_ID");
  const accountId = optionalEnv("ACCOUNT_ID");
  if (workspaceId && runId && accountId) {
    return { workspaceId, runId, accountId };
  }
  throw new Error(
    `plugin: no cloud_session_bindings row for sessionID=${sessionID} after ` +
      `${MAX_ATTEMPTS}×${RETRY_MS}ms and 1:1 env fallback is incomplete ` +
      `(WORKSPACE_ID=${Boolean(workspaceId)} RUN_ID=${Boolean(runId)} ACCOUNT_ID=${Boolean(accountId)}). ` +
      `The pool host should have written the binding via insertBinding() in main.ts ` +
      `before invoking opencode session hooks.` +
      (lastDbError instanceof Error ? ` Last DB error: ${lastDbError.message}` : ""),
  );
}

async function buildRuntime(sessionID: string): Promise<PluginRuntime> {
  const databaseUrl = readEnv("DATABASE_URL_POOLER");
  const { workspaceId, runId, accountId, automationId, dryRun, browserTarget, relaySession, ephemeral } =
    await resolveBinding(databaseUrl, sessionID);
  const useLocalRelay = browserTarget === "local_relay" && Boolean(relaySession) && Boolean(process.env.RELAY_WS_URL);
  const bbApiKey = readEnv("BROWSERBASE_API_KEY");
  const bbProjectId = readEnv("BROWSERBASE_PROJECT_ID");

  const publisher = new Publisher({ databaseUrl, runId, workspaceId, accountId });

  // G.2 — pull the workspace's Browserbase Context (cookies + storage) so
  // the agent boots into the user's logged-in state.
  const sql = postgres(databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  let contextId: string | undefined;
  let contextSource: "workspace_profile" | "browser_site" | "none" = "none";
  let contextHost: string | undefined;
  try {
    const rows = await sql<Array<{ browserbase_profile_id: string | null }>>`
      SELECT browserbase_profile_id FROM public.workspaces WHERE id = ${workspaceId} LIMIT 1
    `;
    contextId = rows[0]?.browserbase_profile_id ?? undefined;
    if (contextId) contextSource = "workspace_profile";
  } catch (e) {
    console.error("plugin: failed to read browserbase_profile_id; continuing context-less", e);
  }
  // E.5 — fallback to the most-recently-verified per-host saved
  // Browserbase Context from E.4's workspace_browser_sites table. Only
  // applies when no workspace-level profile_id is set. The single-context-
  // per-session ceiling means runs that touch multiple gated hosts may
  // still hit a sign-in wall on the non-pinned ones; the E.3 detector
  // emits browser_login_required for those.
  if (!contextId) {
    try {
      const browserSiteRows = await sql<
        Array<{ host: string; storage_state_json: { kind?: string; contextId?: string } | null }>
      >`
        SELECT host, storage_state_json
          FROM public.workspace_browser_sites
         WHERE workspace_id = ${workspaceId}
           AND expires_at > now()
           AND storage_state_json->>'kind' = 'browserbase_context'
         ORDER BY last_verified_at DESC NULLS LAST
         LIMIT 1
      `;
      const row = browserSiteRows[0];
      if (row && row.storage_state_json && typeof row.storage_state_json.contextId === "string") {
        contextId = row.storage_state_json.contextId;
        contextSource = "browser_site";
        contextHost = row.host;
      }
    } catch (e) {
      console.error("plugin: browser-sites contextId lookup failed; continuing", e);
    }
  }

  let bb: BrowserbaseSession;
  let session: CdpSession;
  if (useLocalRelay) {
    // Model B — drive the user's LOCAL Chrome via the relay. Same opencode +
    // warm pool; only the CDP endpoint differs (no Browserbase session). The
    // user's real cookies/passkeys are used (their browser), and screenshots
    // stay ephemeral (see ctx.ephemeral).
    const base = process.env.RELAY_WS_URL!.replace(/\/+$/, "");
    const sep = base.includes("?") ? "&" : "?";
    const cdpWsUrl = `${base}${sep}role=worker&session=${encodeURIComponent(relaySession!)}`;
    await publisher.emit({
      type: "browserbase_session_creating",
      payload: { workspaceId, runId, target: "local_relay", ephemeral: Boolean(ephemeral) },
    });
    session = await cdpAttach({ wsUrl: cdpWsUrl });
    bb = { sessionId: `local-relay:${relaySession}`, cdpWsUrl, liveViewUrl: null } as unknown as BrowserbaseSession;
    await publisher.emit({
      type: "browserbase_session_attached",
      payload: { sessionId: bb.sessionId, liveViewUrl: null, target: "local_relay", ephemeral: Boolean(ephemeral) },
    });
  } else {
    await publisher.emit({
      type: "browserbase_session_creating",
      payload: {
        workspaceId,
        runId,
        contextId: contextId ?? null,
        contextSource,
        ...(contextHost ? { contextHost } : {}),
      },
    });
    bb = await createBrowserbaseSession({
      apiKey: bbApiKey,
      projectId: bbProjectId,
      workspaceId,
      runId,
      ...(contextId ? { contextId } : {}),
    });
    session = await cdpAttach({ wsUrl: bb.cdpWsUrl });
    await publisher.emit({
      type: "browserbase_session_attached",
      payload: { sessionId: bb.sessionId, liveViewUrl: bb.liveViewUrl ?? null },
    });
  }

  // G.2 — persist liveUrl + sessionId on the run row so any consumer can iframe it.
  try {
    await sql`
      UPDATE public.cloud_runs
         SET browserbase_session_id = ${bb.sessionId},
             live_view_url = ${bb.liveViewUrl ?? null}
       WHERE id = ${runId}
    `;
  } catch (e) {
    console.error("plugin: failed to persist liveUrl; continuing", e);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }

  // G.3 — per-workspace EFS sandbox. The container mounts the shared
  // EFS access point at /workspace; we scope this run to a workspace
  // subdir (mkdir -p on first call) and pass that as workspaceRoot
  // so all fs-policy-protected tools can only write here.
  const efsBase = process.env.WORKSPACE_ROOT_BASE ?? "/workspace";
  const workspaceRoot = path.join(efsBase, workspaceId);
  try {
    await fs.mkdir(workspaceRoot, { recursive: true });
  } catch (e) {
    console.error("plugin: failed to mkdir workspaceRoot; continuing", e);
  }

  // G.4 — load active skills + wire skill_write through PgSkillStore.
  const skillLoader = new PgSkillLoader({ databaseUrl });
  let skills: LoadedSkill[] = [];
  try {
    skills = await skillLoader.loadAll({ workspaceId, limit: 20 });
    if (skills.length > 0) {
      await publisher.emit({
        type: "skills_loaded",
        payload: { count: skills.length, names: skills.map((s) => s.name) },
      });
    }
  } catch (e) {
    console.error("plugin: skill load failed; continuing skill-less", e);
  } finally {
    await skillLoader.close().catch(() => undefined);
  }

  // K.6 — load active helpers for this workspace so the system prompt
  // can list them. quotaSql is created below; we'll fill this in after
  // it exists. Placeholder for the runtime return value.
  let helpers: LoadedHelperSummary[] = [];

  const skillStore = new PgSkillStore({ databaseUrl });
  // A.6/A.7 output tools (send_email, send_sms) and A.8's run-completion
  // dispatcher all enforce per-workspace daily caps via the
  // increment_output_quota SECURITY DEFINER function. Use a DEDICATED
  // pg connection — the shared `sql` above is `max:1, idle_timeout:5`
  // and gets closed between calls, causing `write CONNECTION_ENDED`
  // failures under tool-call concurrency (discovered live during A.9).
  const quotaSql = postgres(databaseUrl, {
    max: 2,
    prepare: false,
    idle_timeout: 60,
    connect_timeout: 10,
  });
  const quotaStore = new PgQuotaStore(quotaSql);

  // C.4 — LISTEN/NOTIFY for approval pause/resume requires Supavisor
  // session mode (:5432). The tx-mode pooler at :6543 drops LISTEN
  // registrations on each query (see feedback_supavisor_listen_session_mode).
  const listenUrl = databaseUrl.replace(/:6543\b/, ":5432");
  const listenSql = postgres(listenUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 0,
    connect_timeout: 10,
    connection: { application_name: "basics-worker-approvals-listen" },
  });

  // B.3 — Resolve ACTIVE Composio connected accounts for this run. The
  // resolver is fail-soft: an empty Map on Composio downtime / missing API
  // key, so the tools downstream return `no_connection` errors rather than
  // crashing the run. The `composio_resolved` event surfaces the toolkit
  // slugs (no auth tokens) into cloud_activity so live e2e can verify.
  // K.6 — load helpers now that quotaSql exists. Fail-soft: empty list
  // on error so the run continues without helpers.
  try {
    helpers = await loadHelpersForRun(quotaSql, workspaceId, automationId ?? null);
    if (helpers.length > 0) {
      await publisher.emit({
        type: "helpers_loaded",
        payload: { count: helpers.length, names: helpers.map((h) => h.name) },
      });
    }
  } catch (e) {
    console.error("plugin: helper load failed; continuing helper-less", (e as Error).message);
  }

  // Resolve under the account_id (preferred) AND the workspace_id, since
  // OAuth links may have been minted under either key. In parallel, resolve the
  // org's enabled Composio toolkits (project-level) so the agent can tell
  // "connectable via Composio" from "browser-only".
  const [accountsByToolkit, enabledToolkits] = await Promise.all([
    resolveConnectedAccounts(accountId, { extraUserIds: [workspaceId] }),
    resolveEnabledToolkits(),
  ]);
  await publisher
    .emit({
      type: "composio_resolved",
      payload: {
        toolkitSlugs: Array.from(accountsByToolkit.keys()).sort(),
        accountCount: accountsByToolkit.size,
      },
    })
    .catch((e) => console.error("composio_resolved emit failed", e));

  // Apps — load this workspace's app surfaces so the agent can SEE what
  // exists (to decide what to write to / read from) and use app_emit /
  // app_query. Fail-soft: empty list on error so the run continues.
  let workspaceApps: AppSummaryForPrompt[] = [];
  try {
    const appRows = await quotaSql<Array<{ slug: string; name: string; kind: string; fields: unknown }>>`
      SELECT slug, name, kind, fields
        FROM public.workspace_apps
       WHERE workspace_id = ${workspaceId}::uuid AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 50
    `;
    workspaceApps = appRows.map((r) => ({
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      field_keys: Array.isArray(r.fields)
        ? (r.fields as Array<{ key?: string }>).map((f) => String(f?.key ?? "")).filter(Boolean)
        : [],
    }));
    if (workspaceApps.length > 0) {
      await publisher
        .emit({ type: "apps_loaded", payload: { count: workspaceApps.length, slugs: workspaceApps.map((a) => a.slug) } })
        .catch(() => undefined);
    }
  } catch (e) {
    console.error("plugin: apps load failed; continuing", (e as Error).message);
  }

  // Saved browser-site logins (hosts) — so the agent knows which gated sites
  // it's already signed into and can request missing ones during setup.
  let savedBrowserHosts: string[] = [];
  try {
    const siteRows = await quotaSql<Array<{ host: string }>>`
      SELECT host
        FROM public.workspace_browser_sites
       WHERE workspace_id = ${workspaceId}::uuid
         AND expires_at > now()
       ORDER BY last_verified_at DESC NULLS LAST
       LIMIT 50
    `;
    savedBrowserHosts = siteRows.map((r) => r.host).filter(Boolean);
  } catch (e) {
    console.error("plugin: browser-sites host load failed; continuing", (e as Error).message);
  }

  const ctx: WorkerToolContext = {
    session,
    runId,
    workspaceId,
    accountId,
    // Automation runs are unattended + pre-configured by the user, so they
    // auto-approve (low-human-in-the-loop): a schedule must never silently
    // stall on an approval gate. Ad-hoc runs (no automationId) keep the gate.
    ...(automationId ? { automationId, autoApprove: true } : {}),
    ...(ephemeral ? { ephemeral: true } : {}),
    workspaceRoot,
    skillStore,
    quotaStore,
    // E.2 — saved browser-session loader uses the same tx-mode pg
    // connection as the quota gate. Read-only from this layer; writes
    // happen via the API service (E.4 connect endpoint).
    browserSites: { sql: quotaSql, workspaceId },
    // K.2 — direct SQL handle for tools that write workspace-scoped
    // durable artifacts (cloud_agent_helpers, future per-run state).
    // Re-uses the quota gate's pg connection — same pool, no extra
    // connection cost.
    sql: quotaSql,
    // E.7 — wire the dry-run buffer when cloud_runs.dry_run = true.
    // executeWithApproval consults ctx.dryRun + ctx.dryRunBuffer before
    // the approval gate. Buffer flushes live on each intercept (so the
    // dry_run_actions row column updates immediately and the preview
    // endpoint is correct without waiting for pool teardown) AND once
    // more at session teardown as a durable backstop.
    ...(dryRun
      ? (() => {
          const buf = new DryRunBuffer();
          buf.setFlushHook(async (entries) => {
            try {
              // postgres-js sql.json(value) — `${JSON.stringify(v)}::jsonb`
              // double-encodes (memory: feedback_postgres_js_jsonb_use_sql_json).
              await quotaSql`
                UPDATE public.cloud_runs
                   SET dry_run_actions = ${quotaSql.json(entries as unknown as Parameters<typeof quotaSql.json>[0])}
                 WHERE id = ${runId}
              `;
            } catch (e) {
              console.error("plugin: dry-run live flush failed", (e as Error).message);
            }
          });
          return { dryRun: true as const, dryRunBuffer: buf };
        })()
      : {}),
    composio: {
      accountsByToolkit,
      enabledToolkits,
      // B.4 cache: lazily uses ComposioClient at refresh time;
      // shares the quotaSql connection (max:2, idle_timeout:60).
      cache: new PgComposioToolCache({ sql: quotaSql }),
      // B.5 audit writes (B.7 composio_call): share the same connection.
      auditSql: quotaSql,
      // B.8 denylist policy: load once at session boot. Empty policy on
      // any read error — the default patterns still apply.
      policy: await loadComposioPolicy(quotaSql, workspaceId).catch((err) => {
        console.error("composio policy load failed", (err as Error).message);
        return {};
      }),
    },
    publish: async (event) => {
      await publisher.emit(event);
    },
  };

  return {
    ctx,
    publisher,
    bb,
    session,
    bbApiKey,
    bbProjectId,
    skills,
    helpers,
    apps: workspaceApps,
    browserSites: savedBrowserHosts,
    enabledToolkits,
    // computer_use is offered when the desktop is the executor — either a
    // browser-relay run OR a pure compute run (no browser bridged at all).
    // 'local_compute' offers computer_use WITHOUT launching any local Chrome.
    isLocal: useLocalRelay || browserTarget === "local_compute",
    sessionID,
    workspaceId,
    runId,
    quotaSql,
    listenSql,
  };
}

function ensureRuntime(sessionID: string): Promise<PluginRuntime> {
  let p = runtimeBySession.get(sessionID);
  if (!p) {
    p = buildRuntime(sessionID);
    runtimeBySession.set(sessionID, p);
    // If buildRuntime rejects, drop the cache entry so the next call retries.
    p.catch(() => runtimeBySession.delete(sessionID));
  }
  return p;
}

async function teardownRuntime(sessionID: string): Promise<void> {
  const p = runtimeBySession.get(sessionID);
  if (!p) return;
  runtimeBySession.delete(sessionID);
  try {
    const rt = await p;
    // E.7 — flush dry-run buffer into cloud_runs.dry_run_actions BEFORE
    // closing the pg connection. Best-effort; on failure we still tear
    // down the BB session + connections cleanly.
    if (rt.ctx.dryRun && rt.ctx.dryRunBuffer) {
      try {
        const { count } = await flushDryRunBuffer(rt.quotaSql, rt.runId, rt.ctx.dryRunBuffer);
        await rt.publisher
          .emit({
            type: "dry_run_summary",
            payload: { kind: "dry_run_summary", count, sessionID },
          })
          .catch(() => undefined);
      } catch (e) {
        console.error("plugin: dry-run buffer flush failed", (e as Error).message);
      }
    }
    await rt.publisher.emit({ type: "session_teardown", payload: { sessionID } }).catch(() => undefined);
    await cdpDetach(rt.session).catch(() => undefined);
    // Model B local-relay runs have no Browserbase session to stop (the desktop
    // owns the local Chrome lifecycle); only stop real Browserbase sessions.
    if (!rt.bb.sessionId.startsWith("local-relay:")) {
      await stopBrowserbaseSession(rt.bbApiKey, rt.bbProjectId, rt.bb.sessionId).catch(() => undefined);
    }
    await rt.publisher.close().catch(() => undefined);
    await rt.listenSql.end({ timeout: 2 }).catch(() => undefined);
    await rt.quotaSql.end({ timeout: 2 }).catch(() => undefined);
  } catch {
    // best-effort teardown
  }
}

function formatForOpencode(
  r: ToolResult,
): string | { output: string; metadata?: Record<string, unknown> } {
  if (r.kind === "text") return r.text;
  if (r.kind === "json") {
    return {
      output: typeof r.json === "string" ? r.json : JSON.stringify(r.json),
      metadata: { kind: "json", json: r.json as Record<string, unknown> | undefined },
    };
  }
  if (r.kind === "image") {
    // The image bytes themselves are never echoed back into the model
    // context (they'd blow context budget and the model can't act on raw
    // base64 anyway). When the screenshot tool persisted to S3, we surface
    // the s3Key + signedUrl in the output so the agent can pass them
    // directly to send_email.attachments or final_answer.
    const byteLength =
      r.byteLength ?? Math.floor((r.b64.length * 3) / 4);
    if (r.s3Key) {
      return {
        output: JSON.stringify({
          s3Key: r.s3Key,
          signedUrl: r.signedUrl ?? null,
          byteLength,
          mimeType: r.mimeType ?? "image/png",
        }),
        metadata: { kind: "image", s3Key: r.s3Key, byteLength },
      };
    }
    return {
      output: "[screenshot captured; bytes elided — see screenshot event in agent_activity]",
      metadata: { kind: "image", byteLength },
    };
  }
  if (r.kind === "error") {
    throw new Error(r.message);
  }
  return JSON.stringify(r);
}

export const BasicsBrowserPlugin: Plugin = async (_input) => {
  // Don't eagerly create the BB session — wait for the first tool call.
  // (Saves the BB cost when opencode opens a session that never uses tools.)
  const registry = buildWorkerToolRegistry();
  const tools: Record<string, ReturnType<typeof tool>> = {};

  for (const [name, def] of registry.entries()) {
    // Our tools' params are typically ZodObject; opencode wants a
    // ZodRawShape (the `.shape`). For non-object schemas, fall back to
    // a wrapper that keys the original under `_arg`.
    let argsShape: z.ZodRawShape;
    if (def.params instanceof z.ZodObject) {
      argsShape = def.params.shape as z.ZodRawShape;
    } else {
      argsShape = { _arg: def.params as z.ZodTypeAny };
    }

    tools[name] = tool({
      description: def.description,
      args: argsShape,
      execute: async (args, ocCtx) => {
        const rt = await ensureRuntime(ocCtx.sessionID);
        const toolCallId = randomUUID();
        await rt.publisher.emit({
          type: "tool_call_start",
          payload: { toolCallId, tool: name, params: args },
        });
        const t0 = Date.now();
        try {
          // If our schema was a ZodObject, args is the object directly;
          // if we wrapped under _arg, unwrap.
          const innerInput = "_arg" in (args as Record<string, unknown>)
            ? (args as { _arg: unknown })._arg
            : args;
          const parsed = def.params.parse(innerInput);
          // C.4 — Approval gate. Fast-paths to def.execute when the tool
          // has no `approval` inspector or its decision says not-required;
          // otherwise inserts a pending approval, LISTENs on the per-id
          // channel until NOTIFY (approved/denied) or TTL (expired throws
          // RunPausedError to end the run cleanly).
          const result = await executeWithApproval(
            def,
            toolCallId,
            parsed,
            rt.ctx,
            {
              sqlTx: rt.quotaSql,
              sqlListen: rt.listenSql,
              sqlRules: rt.quotaSql,
            },
          );
          const latencyMs = Date.now() - t0;
          if (result.kind === "image" && typeof (result as { b64?: unknown }).b64 === "string") {
            await rt.publisher.emit({
              type: "screenshot",
              payload: {
                toolCallId,
                s3Key: `pending://${rt.ctx.runId}/${toolCallId}.png`,
                thumbS3Key: `pending://${rt.ctx.runId}/${toolCallId}.thumb.png`,
                byteLength: Math.floor(
                  ((result as { b64: string }).b64.length * 3) / 4,
                ),
              },
            });
          }
          const endResult: Record<string, unknown> =
            result.kind === "image"
              ? { kind: "image" }
              : result.kind === "json"
                ? { kind: "json", json: (result as { json: unknown }).json }
                : result.kind === "text"
                  ? { kind: "text", text: (result as { text: string }).text }
                  : { kind: "error", message: (result as { message: string }).message };
          await rt.publisher.emit({
            type: "tool_call_end",
            payload: { toolCallId, result: endResult, latencyMs },
          });
          return formatForOpencode(result);
        } catch (err) {
          const latencyMs = Date.now() - t0;
          const msg = err instanceof Error ? err.message : String(err);
          // H.4 — tenant-isolation audit. fs-policy throws
          // PathOutsideSandboxError when a tool tries to write/read
          // outside its session's workspaceRoot (absolute path or `..`
          // traversal). Surface that as a dedicated audit event so it
          // shows up in cross-tenant alerts.
          const errName = err instanceof Error ? err.name : "Error";
          if (errName === "PathOutsideSandboxError") {
            await rt.publisher.emit({
              type: "cross_tenant_attempt",
              payload: {
                toolCallId,
                tool: name,
                params: args,
                workspaceId: rt.workspaceId,
                runId: rt.runId,
                sessionID: rt.sessionID,
                message: msg,
              },
            }).catch(() => undefined);
          }
          await rt.publisher.emit({
            type: "tool_call_end",
            payload: { toolCallId, result: { error: msg, code: errName }, latencyMs },
          });
          throw err instanceof Error ? err : new Error(msg);
        }
      },
    });
  }

  return {
    tool: tools,
    // G.4 — inject the workspace's loaded skills as a system-prompt
    // fragment on every model turn. opencode calls this hook just
    // before each LLM call; we trigger ensureRuntime() (which loads
    // skills if not yet loaded for this run), then prepend the §8.3
    // <skills> block.
    "experimental.chat.system.transform": async (input, output) => {
      try {
        if (!input.sessionID) return; // No session yet — nothing to bind to.
        const rt = await ensureRuntime(input.sessionID);
        // G.4 — skills fragment.
        if (rt.skills.length > 0) {
          const fragment = composeSkillContext("any", rt.skills);
          output.system.unshift(fragment);
        }
        // K.6 — helpers fragment. Listed AFTER skills so the agent reads
        // skills first (durable instructions) then helpers (durable code).
        if (rt.helpers.length > 0) {
          const helperFragment = composeHelperContext(rt.helpers);
          if (helperFragment) output.system.unshift(helperFragment);
        }
        // Outputs fragment — ALWAYS injected (even with no apps yet) so the
        // agent persists results to Documents/Apps instead of only the run log.
        const appsFragment = composeAppsContext(rt.apps);
        if (appsFragment) output.system.unshift(appsFragment);
        // Browser-sites fragment — which gated sites are signed in, and to
        // request (not brute-force) logins for ones that aren't.
        output.system.unshift(composeBrowserSitesContext(rt.browserSites));
        // Tool-strategy ladder — prefer APIs > browser > computer-use. The
        // computer-use rung only appears on local runs (rt.isLocal).
        output.system.unshift(composeToolStrategyContext(rt.isLocal));
        // Connections — prefer connected Composio toolkits; if a service isn't
        // Composio-connectable, fall back to the browser + request_browser_login
        // instead of dead-ending on a "no auth config" Composio error.
        output.system.unshift(
          composeConnectionsContext(
            rt.ctx.composio?.accountsByToolkit
              ? Array.from(rt.ctx.composio.accountsByToolkit.keys())
              : [],
            rt.enabledToolkits,
          ),
        );
        // Autonomy — headless cloud runs must never ask/wait. Unshift LAST so
        // it sits FIRST in the system prompt (highest priority).
        output.system.unshift(composeAutonomyContext());
      } catch (e) {
        console.error("plugin: skill/helper system-transform failed", e);
      }
    },
  };
};

// Cleanup hook — opencode SIGTERMs us at server shutdown. Tear down all
// active per-session runtimes (BB sessions, publisher connections).
process.on("SIGTERM", async () => {
  const ids = [...runtimeBySession.keys()];
  await Promise.allSettled(ids.map((id) => teardownRuntime(id)));
});
