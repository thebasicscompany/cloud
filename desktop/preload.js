const { contextBridge, ipcRenderer } = require("electron");

// Minimal, safe bridge the renderer (web app + pill) can call.
contextBridge.exposeInMainWorld("basichome", {
  isDesktop: true,
  platform: process.platform, // "darwin" | "win32" | "linux"
  openApp: (route) => ipcRenderer.send("basichome:open-app", route),
  talk: () => ipcRenderer.send("basichome:talk"),
  pauseCapture: () => ipcRenderer.send("basichome:pause-capture"),
  // Local-run (browser-harness) controls — launch/connect the user's Chrome
  // over CDP for a local run, and stop it.
  localBrowserStart: (opts) => ipcRenderer.invoke("basichome:local-browser:start", opts),
  localBrowserStop: () => ipcRenderer.invoke("basichome:local-browser:stop"),
  // Export the user's local Chrome cookies for one host so the cloud agent can
  // reuse that login (explicit, opt-in). Returns { ok, host, cookies }.
  exportLocalCookies: (host) => ipcRenderer.invoke("basichome:browser-sites:export-local", host),
  // Model B — bridge the local Chrome to the cloud via the relay so a cloud
  // run can drive it (no extra install). opts: { relayUrl, session, token }.
  localRelayStart: (opts) => ipcRenderer.invoke("basichome:local-relay:start", opts),
  localRelayStop: () => ipcRenderer.invoke("basichome:local-relay:stop"),
  // Lens recording/capture. Drives the on-device Lens daemon.
  lensStatus: () => ipcRenderer.invoke("basichome:lens:status"),
  lensRecordStart: (opts) => ipcRenderer.invoke("basichome:lens:record-start", opts),
  lensRecordStop: () => ipcRenderer.invoke("basichome:lens:record-stop"),
  // Floating Record/Teach HUD (the pill) — opens over other apps.
  openPill: () => ipcRenderer.send("basichome:pill:open"),
  closePill: () => ipcRenderer.send("basichome:pill:close"),
  // Capture a screenshot of the screen (the visual half of a demonstration).
  captureScreen: () => ipcRenderer.invoke("basichome:capture-screen"),
  // Settings → Capture: control the always-on Lens daemon.
  lensAlwaysOn: () => ipcRenderer.invoke("basichome:lens:always-on"),
  lensStopCapture: () => ipcRenderer.invoke("basichome:lens:capture-stop"),
  // Computer-use (local): drive the real machine to do a task. Streams steps.
  computerUseStart: (goal) => ipcRenderer.invoke("basichome:computer-use:start", { goal }),
  computerUseStop: () => ipcRenderer.send("basichome:computer-use:stop"),
  onComputerUseStep: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("basichome:computer-use:step", h);
    return () => ipcRenderer.removeListener("basichome:computer-use:step", h);
  },
});
