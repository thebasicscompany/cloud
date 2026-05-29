// Local browser runtime for the Basichome desktop shell.
//
// This is the "browser-harness on your own Chrome" path: instead of a cloud
// Browserbase session, a LOCAL run drives the user's real Chrome via the
// Chrome DevTools Protocol (CDP). The desktop app manages the remote-debugging
// port itself so the user never has to configure anything.
//
// Two modes:
//   1. managed  — launch a dedicated Chrome instance with an isolated profile
//                 (default; keeps automation separate from the user's tabs).
//   2. attach   — attach to the user's already-running Chrome IF it was started
//                 with --remote-debugging-port (explicit opt-in; uses their
//                 real cookies/sessions).
//
// The agent loop itself (opencode + browser-harness plugin) is the same code
// the cloud worker runs; on desktop it is spawned as a local subprocess and
// pointed at LOCAL_CDP_URL. See docs/basichome-final-electron-app/08-*.md.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DEFAULT_PORT = Number(process.env.BASICS_CDP_PORT || 9222);

function chromeCandidates() {
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
  }
  if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    const pfx86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = process.env["LOCALAPPDATA"] || path.join(os.homedir(), "AppData", "Local");
    return [
      path.join(pf, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(pfx86, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(local, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(pf, "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(pfx86, "Microsoft\\Edge\\Application\\msedge.exe"),
    ];
  }
  return ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium", "/usr/bin/microsoft-edge"];
}

function findChrome() {
  for (const c of chromeCandidates()) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

// Resolve the CDP websocket endpoint by polling /json/version on the debug port.
function resolveCdp(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/json/version", timeout: 1500 }, (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            resolve({ webSocketDebuggerUrl: json.webSocketDebuggerUrl, browser: json.Browser, port });
          } catch {
            retry();
          }
        });
      });
      req.on("error", retry);
      req.on("timeout", () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error(`CDP not reachable on :${port} within ${timeoutMs}ms`));
      else setTimeout(tick, 300);
    };
    tick();
  });
}

let _proc = null;

/**
 * Ensure a CDP-controllable Chrome is available and return its endpoint.
 * mode: "managed" launches a dedicated isolated-profile Chrome; "attach"
 * tries to connect to an already-running debug Chrome first.
 */
async function ensureLocalBrowser({ mode = "managed", port = DEFAULT_PORT } = {}) {
  // Already reachable? (covers attach mode + a previously-launched managed one)
  try {
    return await resolveCdp(port, 1200);
  } catch {
    // not running yet
  }
  if (mode === "attach") {
    throw new Error(
      `No Chrome is listening on the debug port (${port}). Start Chrome with --remote-debugging-port=${port}, or use managed mode.`,
    );
  }
  const chrome = findChrome();
  if (!chrome) throw new Error("No Chrome/Edge/Chromium found on this machine.");
  // Per-port profile dir so concurrent/sequential managed instances never
  // contend on a single Chrome singleton lock.
  const userDataDir = path.join(os.tmpdir(), `basichome-managed-chrome-${port}`);
  _proc = spawn(
    chrome,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-allow-origins=*",
      "about:blank",
    ],
    { detached: false, stdio: "ignore" },
  );
  _proc.on("exit", () => {
    _proc = null;
  });
  return resolveCdp(port, 10000);
}

function stopLocalBrowser() {
  if (_proc && !_proc.killed) {
    try {
      _proc.kill();
    } catch {
      // ignore
    }
    _proc = null;
  }
}

function hostMatches(cookieDomain, host) {
  const d = String(cookieDomain || "").replace(/^\./, "").toLowerCase();
  if (!d) return false;
  return d === host || d.endsWith("." + host) || host.endsWith("." + d);
}

/**
 * Export the user's LOCAL Chrome cookies for a single host via CDP
 * (Storage.getCookies on the browser endpoint), shaped like a Playwright
 * storageState cookie list. Reads from whatever CDP-controllable Chrome is on
 * `port` — for the user's real logins, that Chrome must be reachable on the
 * debug port (attach mode). Returns { host, cookies }.
 */
async function exportCookiesForHost(host, { port = DEFAULT_PORT } = {}) {
  const WebSocket = require("ws");
  const target = String(host || "").trim().toLowerCase().replace(/^www\./, "");
  if (!target) throw new Error("host required");
  const { webSocketDebuggerUrl } = await resolveCdp(port, 5000);
  if (!webSocketDebuggerUrl) throw new Error("no CDP websocket endpoint on debug port");
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(webSocketDebuggerUrl, { perMessageDeflate: false });
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("timed out reading cookies"));
    }, 8000);
    ws.on("open", () => ws.send(JSON.stringify({ id: 1, method: "Storage.getCookies" })));
    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.id !== 1) return;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (msg.error) return reject(new Error(msg.error.message || "Storage.getCookies failed"));
      const all = (msg.result && msg.result.cookies) || [];
      const cookies = all
        .filter((c) => hostMatches(c.domain, target))
        .map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || "/",
          expires: typeof c.expires === "number" ? c.expires : -1,
          httpOnly: !!c.httpOnly,
          secure: !!c.secure,
          sameSite: c.sameSite,
        }));
      resolve({ host: target, cookies });
    });
    ws.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

module.exports = { ensureLocalBrowser, stopLocalBrowser, findChrome, resolveCdp, exportCookiesForHost, DEFAULT_PORT };
