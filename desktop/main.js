// Basichome cross-platform desktop shell (Electron) — macOS + Windows.
//
// The web app (cloud/web) IS the product: this shell simply wraps that
// renderer in a native desktop window, plus a tray and a global shortcut.
// The overlay "pill" is part of the web app itself (the in-app overlay
// component) — the shell does NOT spawn a separate pill window.
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen } = require("electron");
const path = require("path");
const localBrowser = require("./local-browser");
const relayClient = require("./relay-client");
const lens = require("./lens-client");

const APP_URL = process.env.BASICS_APP_URL || "http://localhost:3000";

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
  pillWindow.loadURL(`${APP_URL}/pill`);
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
    title: "Basichome",
    backgroundColor: "#f3f3f3",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(APP_URL);
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

app.whenReady().then(() => {
  createMainWindow();

  try {
    tray = new Tray(trayImage());
    tray.setToolTip("Basichome");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Basichome", click: () => createMainWindow() },
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

  // Start Lens in ALWAYS-ON mode (continuous background pattern capture) once
  // the app is up. Best-effort + no-ops when Lens isn't installed; the pill's
  // explicit "teach" sessions are bounded windows within this same daemon.
  // (Capture consent is captured in onboarding; on a real install Lens honors
  // it, and the renderer can pause/resume via the capture controls.)
  lens
    .ensureAlwaysOn()
    .then((s) => console.log("lens always-on:", JSON.stringify(s)))
    .catch((e) => console.error("lens always-on failed (non-fatal):", e && e.message));
});

ipcMain.on("basichome:open-app", (_e, route) => {
  const w = createMainWindow();
  if (typeof route === "string" && route) w.loadURL(APP_URL + route);
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
    return info;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle("basichome:local-relay:stop", async () => {
  relayClient.stopRelay();
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

// Settings → Capture: start/stop the always-on Lens daemon (background pattern
// capture). Lets the user control capture from the main app's settings.
ipcMain.handle("basichome:lens:always-on", async () => lens.ensureAlwaysOn());
ipcMain.handle("basichome:lens:capture-stop", async () => {
  lens.stopLens();
  return { ok: true };
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  closePill();
  relayClient.stopRelay();
  localBrowser.stopLocalBrowser();
  lens.stopLens();
});
