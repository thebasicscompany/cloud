import { cdp } from "@basics/harness";
import { defineTool } from "@basics/shared";
import { z } from "zod";

import { loadStorageStateForUrl } from "../browser-sites/loader.js";
import type { WorkerToolContext } from "./context.js";

/**
 * Mid-session login bridge.
 *
 * Flow when the agent calls this tool:
 *   1. Emit `browser_login_required` (existing UX signal — the run-detail
 *      banner shows "Use my <host> cookies" / "Sign in here").
 *   2. Poll `workspace_browser_sites` for a row matching the host, every
 *      POLL_INTERVAL_MS, up to MAX_WAIT_MS. The user pushes cookies from
 *      their Mac (desktop bridge `exportLocalCookies`) which writes that
 *      row — when it lands, we exit the loop.
 *   3. Inject the cookies into the LIVE Browserbase CDP session via
 *      `Network.setCookies` so the agent's next navigation is authenticated
 *      WITHOUT needing a full session restart. Emit `browser_login_received`
 *      so the UI can flip from "waiting" to "go" and the agent sees that
 *      retry is now viable.
 *   4. Return `{ok: true, cookiesInjected}` so the agent loops back and
 *      re-navigates the gated page.
 *
 * Timeout (5 min): emit `browser_login_timeout` + return `{ok:false}` so
 * the agent can surface a caveat in final_answer instead of hanging forever.
 *
 * Fail-soft: if browserSites context isn't wired (older boot path) we
 * skip the poll/inject entirely and behave like the original event-only
 * tool — the agent still gets the signal, just no auto-resume.
 */

const POLL_INTERVAL_MS = 4_000;
const MAX_WAIT_MS = 5 * 60_000;

export const request_browser_login = defineTool({
  name: "request_browser_login",
  description:
    "Call this when a task needs the user signed in to a website (cookies) that this run is NOT already authenticated for. This tool BLOCKS until the user pushes their cookies (via the in-run 'Use my <host> cookies' button) OR ~5 min times out. When cookies arrive they are injected into the LIVE browser session — your NEXT navigation will be authenticated. Pass the EXACT host the task runs on, including subdomain (e.g. 'dashboard.stripe.com' not 'stripe.com'). On return: {ok:true, cookiesInjected:N} → retry the gated navigation; {ok:false, reason:'timeout'} → surface in final_answer that you couldn't access the site.",
  params: z.object({
    host: z
      .string()
      .min(1)
      .describe(
        "EXACT host that needs a login, including subdomain — e.g. 'dashboard.stripe.com', 'app.hubspot.com', 'youtube.com'.",
      ),
    reason: z
      .string()
      .max(400)
      .optional()
      .describe(
        "Short reason the login is needed (shown to the user in the in-run prompt).",
      ),
  }),
  mutating: false,
  cost: "low",
  execute: async ({ host, reason }, ctx: WorkerToolContext) => {
    const cleanHost = host
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");

    // 1. Surface the signal — the UI banner reads this event + shows the
    //    "Use my <host> cookies" / "Sign in here" buttons.
    await ctx.publish({
      type: "browser_login_required",
      payload: {
        kind: "browser_login_required",
        host: cleanHost,
        reason: reason ?? null,
        source: "agent_request",
        waitingForCookies: Boolean(ctx.browserSites),
        timeoutMs: MAX_WAIT_MS,
      },
    });

    // 2. Fast path — no browser-sites context wired (older runs, tests).
    //    Behave like the original event-only tool.
    if (!ctx.browserSites) {
      return { kind: "json" as const, json: { ok: true, host: cleanHost, surfaced: true, cookiesInjected: 0 } };
    }

    // 3. Poll workspace_browser_sites for cookies. Probe URL must be a real
    //    URL because loadStorageStateForUrl normalizes via the WHATWG parser.
    const probeUrl = `https://${cleanHost}/`;
    const deadline = Date.now() + MAX_WAIT_MS;
    let state: Awaited<ReturnType<typeof loadStorageStateForUrl>> = null;
    while (Date.now() < deadline) {
      state = await loadStorageStateForUrl(
        ctx.browserSites.sql,
        ctx.browserSites.workspaceId,
        probeUrl,
      );
      if (state) break;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (!state) {
      await ctx.publish({
        type: "browser_login_timeout",
        payload: { host: cleanHost, waitedMs: MAX_WAIT_MS },
      });
      return {
        kind: "json" as const,
        json: { ok: false, host: cleanHost, reason: "timeout", waitedMs: MAX_WAIT_MS },
      };
    }

    // 4. Inject cookies into the LIVE Browserbase session via CDP. Same
    //    shape goto_url uses for its session-boot path; the difference is
    //    we're injecting mid-run instead of pre-navigation.
    const ss = state.storageState as
      | { kind?: string; cookies?: Array<Record<string, unknown>> }
      | null;
    const cookies = Array.isArray(ss?.cookies) ? (ss as { cookies: Array<Record<string, unknown>> }).cookies : [];
    let injected = 0;
    if (cookies.length > 0) {
      try {
        await cdp(ctx.session, "Network.setCookies", {
          cookies: cookies.map((c) => ({
            name: String(c.name),
            value: String(c.value),
            ...(c.domain ? { domain: String(c.domain) } : {}),
            path: c.path ? String(c.path) : "/",
            ...(typeof c.expires === "number" && c.expires > 0 ? { expires: c.expires } : {}),
            httpOnly: Boolean(c.httpOnly),
            secure: Boolean(c.secure),
            ...(c.sameSite ? { sameSite: String(c.sameSite) } : {}),
          })),
        });
        injected = cookies.length;
      } catch (err) {
        await ctx.publish({
          type: "browser_login_inject_failed",
          payload: { host: cleanHost, error: (err as Error).message },
        });
        return {
          kind: "json" as const,
          json: { ok: false, host: cleanHost, reason: "cdp_inject_failed", message: (err as Error).message },
        };
      }
    }

    await ctx.publish({
      type: "browser_login_received",
      payload: { kind: "browser_login_received", host: cleanHost, cookiesInjected: injected },
    });

    return {
      kind: "json" as const,
      json: { ok: true, host: cleanHost, cookiesInjected: injected, message: "Cookies injected into live session — retry your navigation." },
    };
  },
});
