// Basics cross-platform desktop shell (Electron) — macOS + Windows.
//
// The web app (cloud/web) IS the product: this shell simply wraps that
// renderer in a native desktop window, plus a tray and a global shortcut.
// The overlay "pill" is part of the web app itself (the in-app overlay
// component) — the shell does NOT spawn a separate pill window.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, desktopCapturer, session, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const localBrowser = require("./local-browser");
const relayClient = require("./relay-client");
const lens = require("./lens-client");
const computerLoop = require("./computer-loop");
const computerWatcher = require("./computer-watcher");
const authContext = require("./auth-context");
const authExternal = require("./auth-external");
const authBridge = require("./auth-bridge");
const { startWebServer, stopWebServer } = require("./web-server");
const { execFile } = require("child_process");

// Override Electron's bundled name ("Electron") so `app.getName()`, the user
// data path, and Windows/Linux UI labels say "Basics" in dev — matching the
// packaged build's `productName`. macOS's app menu still reads from the
// bundle's CFBundleName in Info.plist (patched separately by
// scripts/setup-mac-deeplink.mjs).
app.setName("Basics");

// "Sign in via browser" has two return paths from the landing /desktop-login-bridge:
//   1) POST to the loopback bridge on 127.0.0.1:34567 (preferred — auth-bridge.js)
//   2) basicsoftware-app://auth?session=<base64url-json> (fallback when the POST
//      can't reach us, e.g. browser PNA blocks, no bridge running yet, etc.)
// Without a registered scheme the fallback on macOS launches a bare Electron from
// the npx cache (which shows the "To run a local app..." help screen) instead of
// routing back to us — so register the scheme on every launch and handle both the
// Mac (open-url) and Windows (second-instance argv) dispatch paths.
const AUTH_URL_SCHEME = "basicsoftware-app";
if (process.defaultApp) {
  // Dev (`npx electron .`): bare Electron has no Info.plist entry for our
  // scheme, so encode the script path in the registration — otherwise macOS
  // relaunches Electron with no args and you get the help screen.
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(AUTH_URL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(AUTH_URL_SCHEME);
}

// Single-instance lock: on Windows a deep link spawns a SECOND process and the
// URL arrives as the last argv; route it to the already-running instance.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}

function decodeBridgeSession(encoded) {
  // Mirrors the landing page's encodeSession: base64url of a UTF-8 JSON blob.
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function handleAuthDeepLink(url) {
  let payload;
  try {
    const session = new URL(url).searchParams.get("session");
    if (!session) return;
    payload = decodeBridgeSession(session);
  } catch {
    return;
  }
  if (!payload || !payload.access_token || !payload.refresh_token) return;
  dispatchAuthSession({ access_token: payload.access_token, refresh_token: payload.refresh_token });
}

function dispatchAuthSession(payload) {
  // Same IPC channel the loopback bridge uses (renderer subscribes via
  // window.basichome.onAuthSession → supabase.auth.setSession).
  const send = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("basichome:auth:session", payload);
  };
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createMainWindow();
    else app.whenReady().then(() => createMainWindow());
  }
  if (mainWindow && mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

// macOS: the OS dispatches the URL here whether we're cold-launching or
// already running. preventDefault is required.
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (url && url.startsWith(`${AUTH_URL_SCHEME}://`)) handleAuthDeepLink(url);
});

// Windows: a second launch carries the URL in argv. Pull it out, dispatch,
// and focus the existing window.
app.on("second-instance", (_event, argv) => {
  const url = Array.isArray(argv)
    ? argv.find((a) => typeof a === "string" && a.startsWith(`${AUTH_URL_SCHEME}://`))
    : null;
  if (url) handleAuthDeepLink(url);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});

// Background (always-on) Lens capture is OFF by default — it's a real resource
// cost, so the user opts in (Settings → Capture) and the choice persists. Lazy
// teach recordings still work regardless (the daemon starts on demand).
function capturePrefPath() {
  return path.join(app.getPath("userData"), "capture-prefs.json");
}
function backgroundCaptureEnabled() {
  try {
    return JSON.parse(fs.readFileSync(capturePrefPath(), "utf8")).backgroundCapture === true;
  } catch {
    return false;
  }
}
function setBackgroundCapturePref(on) {
  try {
    fs.writeFileSync(capturePrefPath(), JSON.stringify({ backgroundCapture: Boolean(on) }));
  } catch {
    /* best-effort */
  }
}

// Where the renderer lives. In dev, BASICS_APP_URL points at the running Next
// dev server (localhost:3000). Otherwise it's empty here and filled in at
// app.whenReady() by spawning the bundled Next standalone server in-process
// (see web-server.js) — so the shipped app needs no hosted web.
let appUrl = process.env.BASICS_APP_URL || "";

let mainWindow = null;
let tray = null;
let pillWindow = null;

// The floating Record/Teach HUD — a frameless, always-on-top, transparent
// window that sits OVER the user's other apps (NOT anchored to the main
// window), so they can demonstrate a workflow elsewhere while talking it
// through. Loads the renderer's /pill route, which drives Lens + narration.
function openPill() {
  if (pillWindow && !pillWindow.isDestroyed()) {
    pillWindow.show();
    pillWindow.focus();
    return pillWindow;
  }
  const pw = 500;
  const ph = 96;
  const area = screen.getPrimaryDisplay().workArea;
  pillWindow = new BrowserWindow({
    width: pw,
    height: ph,
    x: Math.round(area.x + (area.width - pw) / 2),
    y: area.y + 18,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Float above normal windows (incl. fullscreen apps where possible).
  pillWindow.setAlwaysOnTop(true, "screen-saver");
  pillWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pillWindow.loadURL(`${appUrl}/pill`);
  pillWindow.on("closed", () => {
    pillWindow = null;
  });
  return pillWindow;
}

function closePill() {
  if (pillWindow && !pillWindow.isDestroyed()) {
    pillWindow.close();
  }
  pillWindow = null;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 620,
    title: "Basics",
    backgroundColor: "#f3f3f3",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    // Custom title bar: hide the OS chrome so the app's own 44px top bar reads
    // as the title bar. Windows overlays the native min/maximize/close controls
    // (titleBarOverlay). macOS keeps its traffic-lights but, since they'd
    // otherwise overlap the custom bar, we hide the chrome and nudge the lights
    // down so they sit centered in the 44px bar. Linux keeps the default chrome.
    ...(process.platform === "win32"
      ? {
          titleBarStyle: "hidden",
          titleBarOverlay: { color: "#f3f3f3", symbolColor: "#52525b", height: 44 },
        }
      : {}),
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hidden",
          trafficLightPosition: { x: 14, y: 14 },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(appUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

function trayImage() {
  // Real Basics logo (build/icon.png is the 1024x1024 source). macOS menu-bar
  // and Windows system-tray icons want ~16-18px; resize from the source so we
  // don't ship a separate tiny asset. NOT marked as a template image — the
  // logo is colored, and template requires monochrome with alpha.
  const img = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png"));
  return img.isEmpty() ? img : img.resize({ width: 18, height: 18, quality: "best" });
}

app.whenReady().then(async () => {
  // Bring up the renderer host BEFORE any window loads it. In dev appUrl is
  // already set (BASICS_APP_URL=localhost:3000); otherwise spawn the bundled
  // Next standalone server in-process and use its local URL. Guarantees the
  // server is accepting connections before the first loadURL().
  if (!appUrl) {
    try {
      appUrl = await startWebServer();
    } catch (e) {
      console.error("failed to start bundled web server:", e && e.message);
      app.quit();
      return;
    }
  }

  // macOS dock icon: in dev mode the bundle's icon is the generic Electron
  // atom — override it with the Basics logo at runtime. No-op on win/linux
  // (app.dock only exists on darwin).
  if (process.platform === "darwin" && app.dock) {
    const dockImg = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png"));
    if (!dockImg.isEmpty()) app.dock.setIcon(dockImg);
  }

  // Electron returns "Not supported" for navigator.mediaDevices.getDisplayMedia()
  // unless the main process registers a display-media request handler. The
  // DemoRecorder ("Record a demo" -> draft an agent from a recording) needs
  // this to capture the screen. On macOS 14+ useSystemPicker delegates to
  // the native screen/window chooser + the green capture indicator; on older
  // versions Electron falls back to our supplied source (primary screen).
  try {
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        desktopCapturer
          .getSources({ types: ["screen", "window"] })
          .then((sources) => {
            const primary = sources.find((s) => s.id.startsWith("screen:")) ?? sources[0];
            if (!primary) {
              callback({});
              return;
            }
            callback({ video: primary, audio: "loopback" });
          })
          .catch(() => callback({}));
      },
      { useSystemPicker: true },
    );
  } catch (e) {
    console.warn("setDisplayMediaRequestHandler unavailable:", e && e.message);
  }

  createMainWindow();

  // macOS: install a standard application menu. Without one, the OS provides no
  // Edit menu, so the system clipboard/undo/select-all accelerators (Cmd+C/V/X/
  // A/Z) and Cmd+Q are dead. The role-based template wires up all of these for
  // free. Windows keeps autoHideMenuBar (no app menu) — behavior unchanged.
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: "appMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" },
      ]),
    );
  }

  try {
    const trayImg = trayImage();
    // macOS menu-bar icons must be flagged as Template images (monochrome with
    // alpha) so the OS tints them for light/dark menu bars; otherwise they're
    // invisible. NOTE: the current source is a 1x1 transparent PNG placeholder —
    // a real ~18x18 monochrome template PNG asset is still needed to actually
    // show an icon in the menu bar (see report TODO).
    // Don't flag as a Template image — the Basics logo is colored, not
    // monochrome, so templating would just erase the green.
    tray = new Tray(trayImg);
    tray.setToolTip("Basics");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Basics", click: () => createMainWindow() },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
    tray.on("click", () => createMainWindow());
  } catch (e) {
    console.error("tray init failed (non-fatal):", e);
  }

  // Global "record / teach" chord — opens the floating Record/Teach HUD over
  // whatever app the user is in, so they can demonstrate + narrate a routine
  // for Lens to capture (the pill's core purpose).
  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    openPill();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });

  // Watch for delegated computer_use sub-tasks whenever the app is open — the
  // desktop is the executor for any LOCAL run, not only browser-relay ones, so
  // a pure computer-use local run is covered too. Cheap poll; only acts on
  // requests the gated worker tool enqueues.
  computerWatcher.startWatcher();

  // Start always-on background capture ONLY if the user has opted in (it's off
  // by default — see Settings → Capture). Teach recordings still start the
  // daemon on demand, so recording works without background mode.
  if (backgroundCaptureEnabled()) {
    lens
      .ensureAlwaysOn()
      .then((s) => console.log("lens always-on:", JSON.stringify(s)))
      .catch((e) => console.error("lens always-on failed (non-fatal):", e && e.message));
  }
});

ipcMain.on("basichome:open-app", (_e, route) => {
  const w = createMainWindow();
  if (typeof route === "string" && route) w.loadURL(appUrl + route);
});

// Local-run (browser-harness) path: launch / connect to the user's Chrome via
// CDP and hand back the endpoint. mode "managed" (default) uses an isolated
// profile; "attach" connects to a user-started --remote-debugging Chrome.
ipcMain.handle("basichome:local-browser:start", async (_e, opts) => {
  try {
    const info = await localBrowser.ensureLocalBrowser(opts ?? {});
    return { ok: true, ...info };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle("basichome:local-browser:stop", async () => {
  localBrowser.stopLocalBrowser();
  return { ok: true };
});

// Export the user's LOCAL Chrome cookies for one host (explicit, opt-in) so the
// cloud agent can reuse that login. Returns { ok, host, cookies } — the renderer
// POSTs them to /api/browser-sites/local-cookies (same-origin, has the session).
ipcMain.handle("basichome:browser-sites:export-local", async (_e, opts) => {
  try {
    const host = typeof opts === "string" ? opts : opts && opts.host;
    const port = (opts && opts.port) || undefined;
    const info = await localBrowser.exportCookiesForHost(host, port ? { port } : {});
    return { ok: true, ...info };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Model B: bridge the local Chrome to the Basics relay so a cloud run can
// drive it. The renderer provisions { relayUrl, session, token } server-side,
// then calls this; the worker for that run connects to the same relay session.
ipcMain.handle("basichome:local-relay:start", async (_e, opts) => {
  try {
    const info = await relayClient.startRelay(opts ?? {});
    // A local run is now live — watch for computer_use sub-tasks the cloud
    // agent delegates, so the integrated (agent-decides) path executes locally.
    computerWatcher.startWatcher();
    return info;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle("basichome:local-relay:stop", async () => {
  relayClient.stopRelay();
  computerWatcher.stopWatcher();
  return { ok: true };
});

// Lens recording/capture (final goal). The renderer drives Record-Routine
// through these; Lens is lazily spawned on macOS and reports unavailable
// elsewhere so the UI degrades gracefully.
ipcMain.handle("basichome:lens:status", async () => lens.lensStatus());
ipcMain.handle("basichome:lens:record-start", async (_e, opts) => lens.startRecording(opts ?? {}));
ipcMain.handle("basichome:lens:record-stop", async () => lens.stopRecording());

// Floating Record/Teach HUD show/hide (driven by the renderer + global chord).
ipcMain.on("basichome:pill:open", () => openPill());
ipcMain.on("basichome:pill:close", () => closePill());

// Capture a screenshot of the primary screen for the record-routine flow — the
// visual half of a demonstration (alongside narration). Downscaled JPEG so a
// handful of frames stays small enough to bundle into the routine document.
ipcMain.handle("basichome:capture-screen", async () => {
  try {
    const { width, height } = screen.getPrimaryDisplay().size;
    const scale = Math.min(1, 1280 / Math.max(1, width));
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) },
    });
    const src = sources[0];
    if (!src) return { ok: false, error: "no screen source" };
    const jpeg = src.thumbnail.toJPEG(55).toString("base64");
    return { ok: true, dataUrl: `data:image/jpeg;base64,${jpeg}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

// Capture per-frame screen context for the Record-a-demo flow. Returns the
// frontmost app's name + window title, plus the active browser tab URL when
// the frontmost app is a known browser. Gives Claude an explicit "user is in
// Gmail at gmail.com/inbox" hint per frame instead of forcing it to read the
// pixels — closes most of the screenpipe-vs-DemoRecorder accuracy gap without
// shipping a separate native daemon (ADR 0013).
//
// macOS only. On Windows we'd reach for GetForegroundWindow + UI Automation;
// not wired yet. Renderer should treat the unsupported case as "no metadata"
// and fall back to plain frames.
const CAPTURE_CONTEXT_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  try
    set winTitle to value of attribute "AXTitle" of front window of frontApp
  on error
    set winTitle to ""
  end try
end tell
set browserURL to ""
if appName is "Safari" then
  try
    tell application "Safari" to set browserURL to URL of current tab of front window
  end try
else if appName is "Google Chrome" or appName is "Google Chrome Canary" then
  try
    tell application "Google Chrome" to set browserURL to URL of active tab of front window
  end try
else if appName is "Arc" then
  try
    tell application "Arc" to set browserURL to URL of active tab of front window
  end try
else if appName is "Microsoft Edge" then
  try
    tell application "Microsoft Edge" to set browserURL to URL of active tab of front window
  end try
else if appName is "Brave Browser" then
  try
    tell application "Brave Browser" to set browserURL to URL of active tab of front window
  end try
end if
return appName & "||" & winTitle & "||" & browserURL
`;

ipcMain.handle("basichome:capture-context", async () => {
  if (process.platform !== "darwin") {
    return { ok: false, error: "unsupported_platform" };
  }
  return new Promise((resolve) => {
    execFile(
      "/usr/bin/osascript",
      ["-e", CAPTURE_CONTEXT_SCRIPT],
      { timeout: 600 },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, error: err.message });
          return;
        }
        const [appName, windowTitle, focusedUrl] = String(stdout || "")
          .trim()
          .split("||");
        resolve({
          ok: true,
          appName: appName || "",
          windowTitle: windowTitle || "",
          focusedUrl: focusedUrl || "",
        });
      },
    );
  });
});

// Computer-use (LOCAL): run a closed eyes→brain→hands loop that drives the real
// machine. Streams step updates to the renderer; bounded + stoppable. Only ever
// started by an explicit local run the user kicked off.
ipcMain.handle("basichome:computer-use:start", async (event, opts) => {
  const goal = typeof opts === "string" ? opts : opts && opts.goal;
  return computerLoop.runComputerUse({
    goal,
    onStep: (s) => {
      try {
        if (!event.sender.isDestroyed()) event.sender.send("basichome:computer-use:step", s);
      } catch {
        /* renderer gone */
      }
    },
  });
});
ipcMain.on("basichome:computer-use:stop", () => computerLoop.stopComputerUse());
// Resume a run that hit the step cap. Same conversation, fresh screenshot — the
// loop file owns the stashed state and refuses if there's nothing to continue.
ipcMain.handle("basichome:computer-use:continue", async (event) => {
  return computerLoop.continueComputerUse({
    onStep: (s) => {
      try {
        if (!event.sender.isDestroyed()) event.sender.send("basichome:computer-use:step", s);
      } catch {
        /* renderer gone */
      }
    },
  });
});

// Workspace auth: the renderer holds the Supabase session, exchanges it for a
// short-lived workspace JWT (cloud/api POST /v1/auth/token), and pushes it here.
// The desktop loops then call cloud/api directly with it. Nothing is minted in
// the desktop process — only the JWT is held, in memory.
ipcMain.handle("basichome:auth:set", (_e, payload) => {
  authContext.setToken(payload || {});
  return { ok: true };
});
ipcMain.handle("basichome:auth:clear", () => {
  authContext.clearToken();
  return { ok: true };
});

// Same exchange the renderer's same-origin route does, but run from MAIN — no
// CORS, no Supabase cookies. The renderer hands us the Supabase access_token
// (which it already has after setSession), we POST it to cloud/api, and store
// the resulting workspace JWT so computer-use + Lens can read it. Returns the
// JWT to the renderer so voice + same-origin /api routes can use it too.
function apiBaseFromEnv() {
  return (process.env.BASICS_API_URL || process.env.API_BASE_URL || "https://api.trybasics.ai").replace(/\/+$/, "");
}
ipcMain.handle("basichome:auth:exchange-supabase", async (_e, payload) => {
  const accessToken = payload && payload.access_token;
  const workspaceId = payload && payload.workspace_id;
  if (!accessToken) return { ok: false, error: "missing access_token" };
  try {
    const res = await fetch(`${apiBaseFromEnv()}/v1/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        workspaceId ? { supabase_access_token: accessToken, workspace_id: workspaceId } : { supabase_access_token: accessToken },
      ),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn("[auth:exchange-supabase] cloud/api rejected:", res.status, body.slice(0, 200));
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    const json = await res.json();
    if (!json || !json.token) return { ok: false, error: "no token in response" };
    authContext.setToken({ token: json.token });
    return { ok: true, token: json.token, expires_at: json.expires_at };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Open an arbitrary URL in the user's default browser. Used by the Chrome
// remote-debugging setup helper to deep-link the user straight to
// chrome://inspect#remote-debugging in their Chrome.
//
// `shell.openExternal` doesn't route chrome:// URLs through Chrome on macOS
// (there's no global LaunchServices handler for that scheme), so for those we
// fall back to `open -a "Google Chrome" <url>`.
const { spawn: spawnProc } = require("node:child_process");
ipcMain.handle("basichome:shell:open-external", async (_e, url) => {
  if (typeof url !== "string" || !url) return { ok: false, error: "missing url" };
  try {
    // chrome:// URLs aren't handled by macOS's default URL routing and
    // shell.openExternal is also unreliable for them on Windows — spawn
    // Chrome directly so the user lands on chrome://inspect every time.
    if (/^chrome:\/\//i.test(url)) {
      if (process.platform === "darwin") {
        spawnProc("open", ["-a", "Google Chrome", url], { detached: true, stdio: "ignore" }).unref();
        return { ok: true };
      }
      if (process.platform === "win32") {
        // `start "" chrome <url>` resolves chrome.exe via PATH/registry — works
        // for default Chrome installs without hardcoding Program Files paths.
        spawnProc("cmd", ["/c", "start", "", "chrome", url], { detached: true, stdio: "ignore", shell: false }).unref();
        return { ok: true };
      }
    }
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Voice (Deepgram) credentials: the renderer can't call cloud/api directly
// (CORS) and the same-origin Next route depends on Supabase cookies that may
// not be set in the bridge sign-in flow. Proxy through main using the
// already-stored workspace JWT.
ipcMain.handle("basichome:voice:credentials", async () => {
  const ctx = await authContext.resolveContext();
  if (!ctx || !ctx.token) return { ok: false, error: "no workspace token — sign in first" };
  try {
    const res = await fetch(`${ctx.apiBase}/v1/voice/credentials`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-workspace-token": ctx.token },
      body: "{}",
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    const json = await res.json();
    if (!json || !json.deepgramToken) return { ok: false, error: "no deepgramToken in response" };
    return { ok: true, token: json.deepgramToken, expiresIn: json.expiresIn ?? 3600 };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Sign-in: open the OAuth URL in the user's REAL browser (Google blocks embedded
// webviews) and capture the redirect via a loopback server; hand the auth code
// back to the renderer, which exchanges it so the session lands in the app.
ipcMain.handle("basichome:auth:open-external", (event, url) => {
  if (typeof url !== "string" || !url) return { ok: false };
  authExternal.openExternalAuth(url, (result) => {
    if (!event.sender.isDestroyed()) event.sender.send("basichome:auth:code", result);
  });
  return { ok: true };
});

// "Sign in via browser" (the web-bridge model, like Wispr/Linear): open the
// landing /desktop-login-bridge in the system browser; after sign-in there it
// POSTs the Supabase session to our loopback (auth-bridge.js, port 34567). We
// forward it to the renderer, which calls supabase.auth.setSession so the
// session lands in-app — no credentials ever typed in the Electron window.
ipcMain.handle("basichome:auth:browser-sign-in", (event) => {
  const landing = process.env.BASICS_LANDING_URL || "https://basicsoftware.ai";
  authBridge.startBrowserSignIn(landing, (result) => {
    if (!event.sender.isDestroyed()) event.sender.send("basichome:auth:session", result);
  });
  return { ok: true };
});

// Settings → Capture: start/stop the always-on Lens daemon (background pattern
// capture). Lets the user control capture from the main app's settings.
ipcMain.handle("basichome:lens:always-on", async () => {
  setBackgroundCapturePref(true); // persist the opt-in so it survives relaunch
  return lens.ensureAlwaysOn();
});
ipcMain.handle("basichome:lens:capture-stop", async () => {
  setBackgroundCapturePref(false);
  await lens.stopAlwaysOn(); // flush + distill the final window, then stop capture
  return { ok: true };
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  closePill();
  relayClient.stopRelay();
  computerWatcher.stopWatcher();
  localBrowser.stopLocalBrowser();
  lens.stopLens();
  stopWebServer();
});
