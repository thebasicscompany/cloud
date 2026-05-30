// Lens integration (final goal) — the on-device recording/capture flow.
//
// Lens is the Basics capture daemon (a forked-screenpipe Rust app) that
// exposes a loopback HTTP API the desktop app drives:
//   GET  /v1/health                 — unauthenticated liveness
//   POST /v1/sessions               — start a bounded capture session (Bearer)
//   POST /v1/sessions/:id/stop       — stop + stamp counts (Bearer)
//   GET  /v1/sessions/:id/stream     — SSE of capture events (Bearer)
// (contract mirrored from thebasicscompany/client assistant/src/lens.)
//
// We talk to it over 127.0.0.1 only, lazily spawning the Lens app on first
// Record. Lens is CROSS-PLATFORM: macOS (ScreenCaptureKit + Apple Vision OCR),
// Windows (Windows Graphics Capture + Windows.Media.Ocr + UIAutomation), and
// Linux (xcap + atspi). We support all three; off-desktop we report
// unavailable so the renderer degrades gracefully.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const LENS_HOST = "127.0.0.1";
const LENS_PORT = Number(process.env.BASICS_LENS_PORT || 3030);
const LENS_SUPPORTED = ["darwin", "win32", "linux"].includes(process.platform);

/** Lens data dir — matches the daemon's `default_cadence_data_dir()` (~/.lens,
 *  overridable via CADENCE_DATA_DIR). The per-launch bearer token lives here. */
function lensDataDir() {
  const env = process.env.CADENCE_DATA_DIR;
  return env && env.trim() ? env : path.join(os.homedir(), ".lens");
}

/** Read the daemon's per-launch first-party bearer token from <data dir>/
 *  auth.token (JSON: { token, port, ... }). The daemon (re)writes it on every
 *  launch, so read fresh each call. Env override wins for tests/onboarding. */
function lensToken() {
  if (process.env.BASICS_LENS_TOKEN) return process.env.BASICS_LENS_TOKEN;
  try {
    const raw = fs.readFileSync(path.join(lensDataDir(), "auth.token"), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === "string" ? parsed.token : "";
  } catch {
    return "";
  }
}

let _proc = null;
let _active = null; // { sessionId }

function reqJson(method, path, { token, body, timeoutMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        host: LENS_HOST,
        port: LENS_PORT,
        path,
        method,
        timeout: timeoutMs,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => {
          let json = null;
          try {
            json = b ? JSON.parse(b) : null;
          } catch {
            /* non-json */
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    r.on("error", reject);
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("lens request timeout"));
    });
    if (payload) r.write(payload);
    r.end();
  });
}

/**
 * Bundled Lens daemon shipped INSIDE the basichome app (one download). In a
 * packaged build it lives under resources/lens/; in dev under desktop/vendor/
 * lens/. Checked before any separately-installed Lens.
 */
function bundledLensCandidates() {
  const names = process.platform === "win32" ? ["lens.exe", "lens-daemon.exe"] : ["lens", "lens-daemon"];
  const roots = [];
  if (process.resourcesPath) roots.push(path.join(process.resourcesPath, "lens"));
  roots.push(path.join(__dirname, "vendor", "lens"));
  const out = [];
  for (const r of roots) for (const n of names) out.push(path.join(r, n));
  return out;
}

/** Cross-platform Lens binary candidates for a separately-installed Lens app. */
function lensBinaryCandidates() {
  if (process.platform === "darwin") {
    return [
      "/Applications/Lens.app/Contents/MacOS/Lens",
      "/Applications/Basics Lens.app/Contents/MacOS/Basics Lens",
    ];
  }
  if (process.platform === "win32") {
    const local = process.env["LOCALAPPDATA"] || path.join(os.homedir(), "AppData", "Local");
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    return [
      path.join(local, "Programs", "Lens", "Lens.exe"),
      path.join(local, "Lens", "Lens.exe"),
      path.join(pf, "Lens", "Lens.exe"),
      path.join(local, "Programs", "basics-lens", "Lens.exe"),
    ];
  }
  // linux
  return ["/usr/bin/lens", "/usr/local/bin/lens", path.join(os.homedir(), ".local/bin/lens")];
}

function findLensBinary() {
  // Prefer the bundled daemon (ships with basichome), then a separate install.
  for (const c of [...bundledLensCandidates(), ...lensBinaryCandidates()]) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Is Lens reachable? Probes /v1/health (unauth). */
async function lensStatus() {
  const supported = LENS_SUPPORTED;
  const installed = Boolean(findLensBinary());
  try {
    const res = await reqJson("GET", "/v1/health", { timeoutMs: 1200 });
    return {
      available: res.status >= 200 && res.status < 300,
      supported,
      installed,
      running: true,
      recording: Boolean(_active),
    };
  } catch {
    return {
      available: false,
      supported,
      installed,
      running: false,
      recording: false,
      reason: !supported
        ? "Recording isn't supported on this platform."
        : installed
          ? "Lens isn't running — it will start when you record."
          : "Install the Lens capture app to record routines.",
    };
  }
}

async function ensureLensRunning() {
  const s = await lensStatus();
  if (s.running) return true;
  const bin = findLensBinary();
  if (!bin) return false;
  // The daemon serves its /v1 API only under the `record` subcommand (a bare
  // invocation just prints help and exits). Pin the loopback port and silence
  // telemetry. It writes its per-launch bearer token to <data dir>/auth.token.
  //
  // --disable-audio: the always-on daemon must NEVER hold the microphone — the
  //   only mic use is the pill's narration during an active teach recording
  //   (captured browser-side via getUserMedia), not background capture.
  // --video-quality low: keep background screen capture light so it doesn't bog
  //   the machine down; teach sessions are short and still capture enough.
  _proc = spawn(
    bin,
    ["record", "--port", String(LENS_PORT), "--disable-telemetry", "--disable-audio", "--video-quality", "low"],
    { detached: false, stdio: "ignore" },
  );
  _proc.on("exit", () => {
    _proc = null;
  });
  // poll health for up to ~8s
  for (let i = 0; i < 16; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const probe = await lensStatus();
    if (probe.running) return true;
  }
  return false;
}

/** Start a bounded capture session (lazily spawns Lens on any supported OS).
 *  workspaceId + userId scope the session and are REQUIRED by /v1/sessions; the
 *  desktop pill supplies them from /api/lens/context. */
async function startRecording({ label, workspaceId, userId } = {}) {
  if (!LENS_SUPPORTED) {
    return { ok: false, error: "Recording isn't supported on this platform." };
  }
  if (!workspaceId || !userId) {
    return { ok: false, error: "Sign in to basichome before recording a routine." };
  }
  const up = await ensureLensRunning();
  if (!up) {
    return {
      ok: false,
      error: findLensBinary()
        ? "Could not start Lens. Open the Lens app and grant screen-capture permission."
        : "Install the Lens capture app to record routines.",
    };
  }
  try {
    const res = await reqJson("POST", "/v1/sessions", {
      token: lensToken(),
      // role:"teach" marks this as an EXPLICIT narrated demonstration (the
      // pill), distinct from the always-on passive capture. The distiller can
      // treat a teach session as a direct routine (one example is enough,
      // since the user narrated the intent) rather than waiting for the
      // passive pattern to repeat enough to cluster.
      body: { workspace_id: workspaceId, user_id: userId, label: label ?? "Recorded routine", role: "teach" },
    });
    const sessionId = res.json?.id ?? res.json?.session_id;
    if (res.status >= 200 && res.status < 300 && sessionId) {
      _active = { sessionId };
      return { ok: true, sessionId };
    }
    return { ok: false, error: `Lens returned ${res.status} on session start.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Stop the active session; returns counts Lens stamped. */
async function stopRecording() {
  if (!_active) return { ok: false, error: "No active recording." };
  const sessionId = _active.sessionId;
  try {
    const res = await reqJson("POST", `/v1/sessions/${encodeURIComponent(sessionId)}/stop`, { token: lensToken() });
    _active = null;
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, sessionId, counts: res.json?.counts ?? res.json ?? null };
    }
    return { ok: false, error: `Lens returned ${res.status} on session stop.`, sessionId };
  } catch (err) {
    _active = null;
    return { ok: false, error: err instanceof Error ? err.message : String(err), sessionId };
  }
}

/**
 * Ensure the ALWAYS-ON Lens daemon is running — continuous background capture
 * for passive pattern detection (the distiller surfaces automation candidates
 * over time). Independent of any record session; the pill's teach session is a
 * bounded window WITHIN this same daemon. Best-effort: no-ops off-platform or
 * when Lens isn't installed.
 */
async function ensureAlwaysOn() {
  if (!LENS_SUPPORTED) return { ok: false, supported: false };
  if (!findLensBinary()) return { ok: false, supported: true, installed: false };
  const ok = await ensureLensRunning();
  return { ok, supported: true, installed: true, alwaysOn: ok };
}

function stopLens() {
  if (_proc && !_proc.killed) {
    try {
      _proc.kill();
    } catch {
      /* ignore */
    }
    _proc = null;
  }
}

module.exports = { lensStatus, startRecording, stopRecording, stopLens, findLensBinary, ensureAlwaysOn };
