// Computer-use WATCHER — the desktop side of the delegated/integrated path.
// While a local run is active, the cloud opencode agent may call its
// `computer_use` tool, which enqueues a request. This watcher claims pending
// requests for the workspace, runs the local eyes→brain→hands loop, and posts
// the result back — so the agent's tool call resolves with a real outcome.
//
// Runs only while the relay is bridged (a local run is happening). One request
// at a time.
const computerLoop = require("./computer-loop");

const APP_URL = process.env.BASICS_APP_URL || "http://localhost:3000";
const POLL_MS = 2500;

let _timer = null;
let _busy = false;
let _ws = null;

async function workspaceId() {
  if (_ws) return _ws;
  try {
    const r = await fetch(`${APP_URL}/api/lens/context`, { cache: "no-store" });
    if (r.ok) _ws = (await r.json()).workspaceId || null;
  } catch {
    /* retry next tick */
  }
  return _ws;
}

async function tick() {
  if (_busy) return;
  const ws = await workspaceId();
  if (!ws) return;

  let claimed = null;
  try {
    const r = await fetch(`${APP_URL}/api/computer-use/next`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: ws }),
    });
    if (r.ok) claimed = (await r.json()).request;
  } catch {
    return;
  }
  if (!claimed) return;

  _busy = true;
  let payload;
  try {
    const res = await computerLoop.runComputerUse({ goal: claimed.task });
    payload = res.error ? { ok: false, error: res.error } : { ok: true, text: res.text, steps: res.steps };
  } catch (e) {
    payload = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  try {
    await fetch(`${APP_URL}/api/computer-use/${claimed.id}/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, workspaceId: ws }),
    });
  } catch {
    /* the worker will time out + mark error if we couldn't report */
  }
  _busy = false;
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
