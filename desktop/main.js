// Basics cross-platform desktop shell (Electron) — macOS + Windows.
//
// The web app (cloud/web) IS the product: this shell simply wraps that
// renderer in a native desktop window, plus a tray and a global shortcut.
// The overlay "pill" is part of the web app itself (the in-app overlay
// component) — the shell does NOT spawn a separate pill window.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen, desktopCapturer } = require("electron");
const path = require("path");
const fs = require("fs");
const localBrowser = require("./local-browser");
const relayClient = require("./relay-client");
const lens = require("./lens-client");
const computerLoop = require("./computer-loop");
const computerWatcher = require("./computer-watcher");
const authContext = require("./auth-context");
const authExternal = require("./auth-external");
const { startWebServer, stopWebServer } = require("./web-server");

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
  return nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  );
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
    if (process.platform === "darwin") trayImg.setTemplateImage(true);
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
