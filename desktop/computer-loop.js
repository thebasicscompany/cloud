// Computer-use LOOP (local runs) — the desktop drives the closed loop:
//   eyes (screen capture) -> brain (API /v1/computer/step) -> hands (injection)
// repeated until the brain says done or maxSteps. The brain is pluggable: today
// Claude computer-use behind the API; an Agent-S3 / open-model harness can
// replace that endpoint without changing this file.
//
// Coordinates: we send the brain a downscaled screenshot and tell it those
// dimensions; it answers in that space; we scale back to real screen pixels for
// the hands. SAFETY: bounded steps + an interruptible stop flag.
const { desktopCapturer, screen } = require("electron");

const hands = require("./computer-hands");

const APP_URL = process.env.BASICS_APP_URL || "http://localhost:3000";
const SEND_WIDTH = 1280; // keep within the model's trained resolution band
const MAX_STEPS = 24;
const STEP_PAUSE_MS = 120;

let _stop = false;
let _running = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchContext() {
  try {
    const res = await fetch(`${APP_URL}/api/lens/context`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      return { apiBase: (j.apiBase || "").replace(/\/+$/, ""), token: j.token || "" };
    }
  } catch {
    /* fall through */
  }
  return { apiBase: "", token: "" };
}

// Capture the primary screen, downscaled to SEND_WIDTH. Returns the JPEG +
// the sent dims (brain's coordinate space) + the real screen dims (hands space).
async function captureScreen() {
  const display = screen.getPrimaryDisplay();
  const realW = display.size.width;
  const realH = display.size.height;
  const sentW = Math.min(SEND_WIDTH, realW);
  const sentH = Math.round(realH * (sentW / realW));
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: sentW, height: sentH } });
  const src = sources[0];
  if (!src) throw new Error("no screen source");
  const base64 = src.thumbnail.toJPEG(70).toString("base64");
  return { base64, sentW, sentH, realW, realH };
}

function scaleAction(a, shot) {
  const out = { ...a };
  if (typeof a.x === "number") out.x = Math.round((a.x * shot.realW) / shot.sentW);
  if (typeof a.y === "number") out.y = Math.round((a.y * shot.realH) / shot.sentH);
  return out;
}

async function postStep(ctx, payload) {
  const res = await fetch(`${ctx.apiBase}/v1/computer/step`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ctx.token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`brain HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function imageBlock(base64) {
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } };
}

/**
 * Run a local computer-use task. onStep({step, text, actions}) streams progress.
 * Returns { done, text, steps } or { error }. Bounded + stoppable.
 */
async function runComputerUse({ goal, maxSteps = MAX_STEPS, onStep } = {}) {
  if (_running) return { error: "A computer-use run is already in progress." };
  if (!goal || !String(goal).trim()) return { error: "Give it a goal." };
  if (!hands.supported) return { error: "Computer-use isn't supported on this platform yet." };

  const ctx = await fetchContext();
  if (!ctx.apiBase || !ctx.token) return { error: "Sign in to basichome first (no workspace context)." };

  _running = true;
  _stop = false;
  try {
    let shot = await captureScreen();
    const messages = [{ role: "user", content: [{ type: "text", text: String(goal) }, imageBlock(shot.base64)] }];

    for (let step = 0; step < maxSteps; step++) {
      if (_stop) return { done: false, stopped: true, text: "Stopped.", steps: step };

      const res = await postStep(ctx, { goal: String(goal), width: shot.sentW, height: shot.sentH, messages });
      messages.push({ role: "assistant", content: res.assistant.content });
      if (typeof onStep === "function") onStep({ step: step + 1, text: res.text, actions: res.actions });

      if (res.done) return { done: true, text: res.text || "Done.", steps: step + 1 };

      // Execute each action on the real screen.
      for (const a of res.actions) {
        if (_stop) break;
        if (a.type === "screenshot" || a.type === "noop" || a.type === "unknown") continue;
        try {
          await hands.act(scaleAction(a, shot));
        } catch (err) {
          if (typeof onStep === "function") onStep({ step: step + 1, error: err instanceof Error ? err.message : String(err) });
        }
        await sleep(STEP_PAUSE_MS);
      }

      // Fresh screenshot → one tool_result per tool_use so the brain sees the outcome.
      shot = await captureScreen();
      messages.push({
        role: "user",
        content: res.actions.map((a) => ({ type: "tool_result", tool_use_id: a.tool_use_id, content: [imageBlock(shot.base64)] })),
      });
    }
    return { done: false, text: "Reached the step limit without finishing.", steps: maxSteps };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    _running = false;
    _stop = false;
  }
}

function stopComputerUse() {
  _stop = true;
}

module.exports = { runComputerUse, stopComputerUse, isRunning: () => _running };
