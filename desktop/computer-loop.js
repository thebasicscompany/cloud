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
const authContext = require("./auth-context");

const APP_URL = process.env.BASICS_APP_URL || "http://localhost:3000";
const SEND_WIDTH = 1456; // within Anthropic's <=1568 bound; more legible small UI text
const MAX_STEPS = 60;
const STEP_PAUSE_MS = 250; // settle time between actions (app launchers need a beat)

let _stop = false;
let _running = false;
// When a run hits the step cap we stash its in-flight conversation here so the
// user can Continue without restarting. Cleared on new run, stop, completion,
// or error. Lives only in memory — gone if the app is restarted.
let _pending = null;

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
  // Workspace JWT + cloud/api base from the shared auth-context (renderer-fed,
  // with a transitional /api/lens/context fallback). No secret lives here.
  const c = await authContext.resolveContext();
  return { apiBase: c.apiBase, token: c.token };
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
  const base64 = src.thumbnail.toJPEG(88).toString("base64"); // q88: small UI text stays legible for "read" tasks
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
// Recipes live in cloud/api (/v1/computer/recipe), scoped to the JWT workspace.
// Transitional fallback to the dev web route until the api deploy lands.
async function fetchRecipe(ctx, goal) {
  if (authContext.cloudEnabled() && ctx && ctx.token) {
    try {
      const r = await fetch(`${ctx.apiBase}/v1/computer/recipe?task=${encodeURIComponent(goal)}`, {
        headers: { "x-workspace-token": ctx.token },
        cache: "no-store",
      });
      if (r.ok) return (await r.json()).recipe;
    } catch {
      /* fall back to web */
    }
  }
  try {
    const r = await fetch(`${APP_URL}/api/computer-use/recipe?task=${encodeURIComponent(goal)}`, { cache: "no-store" });
    if (r.ok) return (await r.json()).recipe;
  } catch {
    /* none */
  }
  return null;
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

async function saveRecipe(ctx, goal, actionLog, summary) {
  if (!actionLog || actionLog.length === 0) return;
  const approach = actionLog.join("; ");
  const body = JSON.stringify({ task: goal, approach, title: (summary || "").slice(0, 120) });
  if (authContext.cloudEnabled() && ctx && ctx.token) {
    try {
      const r = await fetch(`${ctx.apiBase}/v1/computer/recipe`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-workspace-token": ctx.token },
        body,
      });
      if (r.ok) return;
    } catch {
      /* fall back to web */
    }
  }
  try {
    await fetch(`${APP_URL}/api/computer-use/recipe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    /* best-effort */
  }
}

// The step loop itself — extracted so both a fresh run AND a Continue can drive
// it. Closes over the conversation state; on cap-out, stashes that state into
// _pending so continueComputerUse can pick up the same conversation.
async function runStepLoop({ ctx, goal, shot, messages, actionLog, maxSteps, onStep, stepOffset = 0, replayed = false }) {
  let currentShot = shot;
  for (let i = 0; i < maxSteps; i++) {
    const stepIdx = stepOffset + i;
    if (_stop) return { done: false, stopped: true, text: "Stopped.", steps: stepIdx };

    const res = await postStep(ctx, { goal, width: currentShot.sentW, height: currentShot.sentH, platform: process.platform, messages });
    messages.push({ role: "assistant", content: res.assistant.content });
    if (typeof onStep === "function") onStep({ step: stepIdx + 1, text: res.text, actions: res.actions });

    if (res.done) {
      try {
        await saveRecipe(ctx, goal, actionLog, res.text);
      } catch {
        /* best-effort */
      }
      return { done: true, text: res.text || "Done.", steps: stepIdx + 1, replayed };
    }

    // Execute each action on the real screen.
    for (const a of res.actions) {
      if (_stop) break;
      if (a.type === "screenshot" || a.type === "noop" || a.type === "unknown") continue;
      try {
        await hands.act(scaleAction(a, currentShot));
        actionLog.push(compactAction(a));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const hint = macPermissionHint(msg);
        if (hint) return { error: hint }; // permission gap — stop with guidance, don't thrash
        if (typeof onStep === "function") onStep({ step: stepIdx + 1, error: msg });
      }
      await sleep(STEP_PAUSE_MS);
    }

    // Fresh screenshot → one tool_result per tool_use so the brain sees the outcome.
    currentShot = await captureScreen();
    messages.push({
      role: "user",
      content: res.actions.map((a) => ({ type: "tool_result", tool_use_id: a.tool_use_id, content: [imageBlock(currentShot.base64)] })),
    });
  }
  // Step cap hit. Stash everything so the renderer can offer Continue and the
  // resume picks up the same conversation (just with a fresh screenshot).
  const stepsSoFar = stepOffset + maxSteps;
  _pending = { ctx, goal, shot: currentShot, messages, actionLog, replayed, stepsSoFar };
  return {
    done: false,
    cappedAt: stepsSoFar,
    canContinue: true,
    text: `Hit the ${stepsSoFar}-step limit without finishing — tap Continue to keep going.`,
    steps: stepsSoFar,
  };
}

/**
 * Run a local computer-use task. onStep({step, text, actions}) streams progress.
 * Returns { done, text, steps } on completion, { canContinue: true, ... } if it
 * hits the step cap (resumable via continueComputerUse), or { error }.
 */
async function runComputerUse({ goal, maxSteps = MAX_STEPS, onStep } = {}) {
  if (_running) return { error: "A computer-use run is already in progress." };
  if (!goal || !String(goal).trim()) return { error: "Give it a goal." };
  if (!hands.supported) return { error: "Computer-use isn't supported on this platform yet." };

  const ctx = await fetchContext();
  if (!ctx.apiBase || !ctx.token) return { error: "Sign in to basichome first (no workspace context)." };

  _running = true;
  _stop = false;
  _pending = null; // any prior pending state is from a different (now abandoned) task
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
      const recipe = await fetchRecipe(ctx, String(goal));
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

    return await runStepLoop({ ctx, goal: String(goal), shot, messages, actionLog, maxSteps, onStep, replayed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: macPermissionHint(msg) || msg };
  } finally {
    _running = false;
    _stop = false;
  }
}

/**
 * Resume a run that hit the step cap. Re-captures the screen first (time has
 * passed since the cap, so the cached image is likely stale), splices the fresh
 * shot into the last tool_result, then drives the same conversation forward.
 */
async function continueComputerUse({ extraSteps = MAX_STEPS, onStep } = {}) {
  if (_running) return { error: "A computer-use run is already in progress." };
  if (!_pending) return { error: "Nothing to continue — start a new task." };

  const pending = _pending;
  _pending = null;
  _running = true;
  _stop = false;
  try {
    const shot = await captureScreen();
    // Replace the last tool_result image(s) with the fresh capture so the brain
    // resumes against current screen state, not what it looked like at cap time.
    const last = pending.messages[pending.messages.length - 1];
    if (last && last.role === "user" && Array.isArray(last.content)) {
      for (const block of last.content) {
        if (block && block.type === "tool_result" && Array.isArray(block.content)) {
          for (const inner of block.content) {
            if (inner && inner.type === "image" && inner.source) {
              inner.source = { type: "base64", media_type: "image/jpeg", data: shot.base64 };
            }
          }
        }
      }
    }
    return await runStepLoop({
      ctx: pending.ctx,
      goal: pending.goal,
      shot,
      messages: pending.messages,
      actionLog: pending.actionLog,
      maxSteps: extraSteps,
      onStep,
      stepOffset: pending.stepsSoFar,
      replayed: pending.replayed,
    });
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
  // Explicit stop means the user is abandoning this task — don't offer Continue.
  _pending = null;
}

function canContinue() {
  return _pending !== null;
}

module.exports = { runComputerUse, continueComputerUse, stopComputerUse, isRunning: () => _running, canContinue };
