import { defineTool } from "@basics/shared";
import { z } from "zod";
import type { WorkerToolContext } from "./context.js";

/**
 * Lets the agent declare that a task needs a browser login (cookies) the run is
 * NOT already authenticated for. Emits a `browser_login_required` activity event
 * — the SAME signal the run banner + home "waiting on you" surface read — so the
 * user gets a one-click "Sign in to <host>" prompt. The agent calls this instead
 * of (never) trying to type a password itself.
 */
export const request_browser_login = defineTool({
  name: "request_browser_login",
  description:
    "Call this when a task needs the user signed in to a website (a browser login / cookies) that this run is NOT already authenticated for — e.g. a personal feed, inbox, dashboard, or account page on a site that isn't in <browser_sites>. It surfaces a one-click 'Sign in to <host>' prompt to the user (on the run and on Home). Pass the EXACT host the task runs on, INCLUDING any subdomain — e.g. 'dashboard.stripe.com' for the Stripe dashboard (NOT 'stripe.com'), 'app.hubspot.com', or 'youtube.com'. Logins are per-host, so the bare registrable domain usually does NOT carry an app's session. If a previously-saved login STILL hits a sign-in wall, it was saved for the wrong host — request the EXACT host you're actually on. Then stop and tell the user to connect it and re-run. NEVER try to enter a password yourself.",
  params: z.object({
    host: z
      .string()
      .min(1)
      .describe(
        "The EXACT host that needs a login, including subdomain — e.g. 'dashboard.stripe.com', 'app.hubspot.com', 'youtube.com'. Use the host the task actually navigates to, not the bare registrable domain.",
      ),
    reason: z.string().max(400).optional().describe("Short reason the login is needed (what the task can't do without it)."),
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
    await ctx.publish({
      type: "browser_login_required",
      payload: { kind: "browser_login_required", host: cleanHost, reason: reason ?? null, source: "agent_request" },
    });
    return { kind: "json", json: { ok: true, host: cleanHost, surfaced: true } };
  },
});
