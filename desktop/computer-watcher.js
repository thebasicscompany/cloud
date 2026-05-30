// Computer-use WATCHER — the desktop side of the delegated/integrated path.
// While a local run is active, the cloud opencode agent may call its
// `computer_use` tool, which enqueues a request. This watcher claims pending
// requests for the workspace, runs the local eyes→brain→hands loop, and posts
// the result back — so the agent's tool call resolves with a real outcome.
//
// Runs only while the relay is bridged (a local run is happening). One request
// at a time.
const computerLoop = require("./computer-loop");
const authContext = require("./auth-context");

const APP_URL = process.env.BASICS_APP_URL || "http://localhost:3000";
const POLL_MS = 2500;

let _timer = null;
let _busy = false;

// Claim the oldest pending request. Prefers cloud/api (/v1/computer/next —
// scoped to the verified JWT, NO client-supplied workspaceId); transitional
// fallback to the dev web route only on 404 (not-yet-deployed) or a network
// error, so we never double-claim against a real API error.
async function claimNext(ctx) {
  if (authContext.cloudEnabled() && ctx.token) {
    try {
      const r = await fetch(`${ctx.apiBase}/v1/computer/next`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-workspace-token": ctx.token },
        body: "{}",
      });
      if (r.ok) return (await r.json()).request;
      if (r.status !== 404) return null;
    } catch {
      /* fall back */
    }
  }
  try {
    const r = await fetch(`${APP_URL}/api/computer-use/next`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: ctx.workspaceId }),
    });
    if (r.ok) return (await r.json()).request;
  } catch {
    /* none */
  }
  return null;
}

async function reportResult(ctx, id, payload) {
  if (authContext.cloudEnabled() && ctx.token) {
    try {
      const r = await fetch(`${ctx.apiBase}/v1/computer/${id}/result`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-workspace-token": ctx.token },
        body: JSON.stringify(payload),
      });
      if (r.ok) return;
      if (r.status !== 404) return;
    } catch {
      /* fall back */
    }
  }
  try {
    await fetch(`${APP_URL}/api/computer-use/${id}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, workspaceId: ctx.workspaceId }),
    });
  } catch {
    /* the worker will time out + mark error if we couldn't report */
  }
}

async function tick() {
  if (_busy) return;
  const ctx = await authContext.resolveContext();
  if (!ctx.token && !ctx.workspaceId) return; // not signed in yet

  const claimed = await claimNext(ctx);
  if (!claimed) return;

  _busy = true;
  try {
    let payload;
    try {
      const res = await computerLoop.runComputerUse({ goal: claimed.task });
      payload = res.error ? { ok: false, error: res.error } : { ok: true, text: res.text, steps: res.steps };
    } catch (e) {
      payload = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    await reportResult(ctx, claimed.id, payload);
  } finally {
    _busy = false;
  }
}

function startWatcher() {
  if (_timer) return;
  _timer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_MS);
}

function stopWatcher() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { startWatcher, stopWatcher };
