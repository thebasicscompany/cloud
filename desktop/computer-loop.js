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
const STEP_PAUSE_MS = 250; // settle time between actions (app launchers need a beat)

let _stop = false;
let _running = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// macOS gates input injection (Accessibility + Automation) and capture (Screen
// Recording) behind TCC. When a hands action fails for that reason, surface a
// clear, actionable message instead of a cryptic osascript error.
const MAC_PERM_RE = /not authoriz|assistive access|accessibility|screen recording|-1743|-25211|apple events/i;
function macPermissionHint(errMsg) {
  if (process.platform !== "darwin" || !MAC_PERM_RE.test(String(errMsg))) return null;
  return "macOS needs permission: open System Settings → Privacy & Security and enable basichome under Accessibility, Screen Recording, and Automation, then try again.";
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

// ── self-learning recipe cache ────────────────────────────────────────────
async function fetchRecipe(goal) {
  const r = await fetch(`${APP_URL}/api/computer-use/recipe?task=${encodeURIComponent(goal)}`, { cache: "no-store" });
  if (!r.ok) return null;
  return (await r.json()).recipe;
}

// One-shot plan: adapt a recipe into concrete actions for this task (the fast
// path that gets REPLAYED). Hits the API brain (not the web).
async function fetchPlan(ctx, goal, recipe, shot) {
  try {
    const r = await fetch(`${ctx.apiBase}/v1/computer/plan`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ctx.token}` },
      body: JSON.stringify({ goal, recipe, platform: process.platform, width: shot.sentW, height: shot.sentH, image: shot.base64 }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Compact one action for the recipe — keep the reusable essence (what was typed,
// which key), drop screen-specific coordinates the next run will re-derive.
function compactAction(a) {
  if (a.type === "type") return `type ${JSON.stringify(a.text || "")}`;
  if (a.type === "key") return `press ${a.key || a.combo || ""}`;
  if (a.type === "double_click") return "double-click the relevant element";
  if (a.type === "click") return "click the relevant on-screen element";
  if (a.type === "scroll") return "scroll";
  return a.type;
}

async function saveRecipe(goal, actionLog, summary) {
  if (!actionLog || actionLog.length === 0) return;
  const approach = actionLog.join("; ");
  await fetch(`${APP_URL}/api/computer-use/recipe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task: goal, approach, title: (summary || "").slice(0, 120) }),
  });
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
    const actionLog = [];
    let replayed = false;

    // Self-learning FAST PATH: if a similar task succeeded before, adapt that
    // recipe into a concrete plan in ONE call and REPLAY it (no per-step model),
    // then verify via the step loop below — which HEALS on any divergence. This
    // is the smart bit: replay when confident, but the step loop re-checks
    // reality and takes over the moment the screen doesn't match.
    try {
      const recipe = await fetchRecipe(String(goal));
      if (recipe && recipe.approach) {
        if (typeof onStep === "function") onStep({ step: 0, text: "Found a learned recipe — replaying the fast path." });
        const plan = await fetchPlan(ctx, String(goal), recipe.approach, shot);
        if (plan && Array.isArray(plan.actions) && plan.actions.length) {
          for (const a of plan.actions) {
            if (_stop) break;
            if (!a || a.type === "screenshot" || a.type === "noop") continue;
            try {
              await hands.act(scaleAction(a, shot));
              actionLog.push(compactAction(a));
            } catch (err) {
              const hint = macPermissionHint(err instanceof Error ? err.message : String(err));
              if (hint) return { error: hint };
            }
            await sleep(STEP_PAUSE_MS);
          }
          replayed = true;
          shot = await captureScreen();
        }
      }
    } catch {
      /* no recipe / plan failed — fall through to thinking */
    }

    // After a replay, the FIRST step-loop call just verifies + heals; without a
    // replay it's a normal fresh run.
    const firstText = replayed
      ? `${goal}\n\n(You just replayed a learned recipe for a similar task. Verify from the screenshot whether THIS task is complete. If it's done, stop and report the result. If anything is off or incomplete, take over and finish it.)`
      : String(goal);
    const messages = [{ role: "user", content: [{ type: "text", text: firstText }, imageBlock(shot.base64)] }];

    for (let step = 0; step < maxSteps; step++) {
      if (_stop) return { done: false, stopped: true, text: "Stopped.", steps: step };

      const res = await postStep(ctx, { goal: String(goal), width: shot.sentW, height: shot.sentH, platform: process.platform, messages });
      messages.push({ role: "assistant", content: res.assistant.content });
      if (typeof onStep === "function") onStep({ step: step + 1, text: res.text, actions: res.actions });

      if (res.done) {
        // Learn: save the approach that worked so the next similar task is faster.
        try {
          await saveRecipe(String(goal), actionLog, res.text);
        } catch {
          /* best-effort */
        }
        return { done: true, text: res.text || "Done.", steps: step + 1, replayed };
      }

      // Execute each action on the real screen.
      for (const a of res.actions) {
        if (_stop) break;
        if (a.type === "screenshot" || a.type === "noop" || a.type === "unknown") continue;
        try {
          await hands.act(scaleAction(a, shot));
          actionLog.push(compactAction(a));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const hint = macPermissionHint(msg);
          if (hint) return { error: hint }; // permission gap — stop with guidance, don't thrash
          if (typeof onStep === "function") onStep({ step: step + 1, error: msg });
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
    const msg = err instanceof Error ? err.message : String(err);
    return { error: macPermissionHint(msg) || msg };
  } finally {
    _running = false;
    _stop = false;
  }
}

function stopComputerUse() {
  _stop = true;
}

module.exports = { runComputerUse, stopComputerUse, isRunning: () => _running };
