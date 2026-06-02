const { contextBridge, ipcRenderer } = require("electron");

// Let the renderer's CSS target the host OS — used for things like leaving
// room above the sidebar header so the macOS traffic lights don't crowd the
// logo, and making that strip a draggable window region.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("electron", `electron-${process.platform}`);
});

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
  computerUseContinue: () => ipcRenderer.invoke("basichome:computer-use:continue"),
  onComputerUseStep: (cb) => {
    const h = (_e, s) => cb(s);
    ipcRenderer.on("basichome:computer-use:step", h);
    return () => ipcRenderer.removeListener("basichome:computer-use:step", h);
  },
  // Workspace auth: the renderer exchanges its Supabase session for a short-lived
  // workspace JWT (cloud/api POST /v1/auth/token) and pushes it to the desktop
  // loops here. Only the JWT crosses — never the Supabase service-role key or the
  // workspace-JWT signing secret (those live solely in cloud/api).
  setWorkspaceToken: (payload) => ipcRenderer.invoke("basichome:auth:set", payload),
  clearWorkspaceToken: () => ipcRenderer.invoke("basichome:auth:clear"),
  // Let the renderer outsource the mint to MAIN: avoids the dev CORS allowlist
  // gap (cloud/api doesn't whitelist http://localhost:3000) and the Supabase
  // cookie-sync race that makes the same-origin /api/auth/desktop-token route
  // flap with 401s. Main POSTs to cloud/api directly and stores the JWT.
  exchangeSupabaseSession: (payload) => ipcRenderer.invoke("basichome:auth:exchange-supabase", payload),
  // Voice (Deepgram): proxy through main using the stored workspace JWT.
  voiceCredentials: () => ipcRenderer.invoke("basichome:voice:credentials"),
  // Open an arbitrary URL in the user's default browser. Used to send them
  // to chrome://inspect#remote-debugging from the local-Chrome setup helper.
  openExternal: (url) => ipcRenderer.invoke("basichome:shell:open-external", url),
  // Open an OAuth URL in the user's real browser; the resolved { code, error }
  // comes back via onAuthCode (the renderer then exchanges the code for a session).
  openExternalAuth: (url) => ipcRenderer.invoke("basichome:auth:open-external", url),
  onAuthCode: (cb) => {
    const h = (_e, result) => cb(result);
    ipcRenderer.on("basichome:auth:code", h);
    return () => ipcRenderer.removeListener("basichome:auth:code", h);
  },
  // "Sign in via browser" — open the landing login in the system browser; the
  // resolved Supabase session ({access_token, refresh_token} | {error}) comes
  // back via onAuthSession, and the renderer calls supabase.auth.setSession.
  signInViaBrowser: () => ipcRenderer.invoke("basichome:auth:browser-sign-in"),
  onAuthSession: (cb) => {
    const h = (_e, result) => cb(result);
    ipcRenderer.on("basichome:auth:session", h);
    return () => ipcRenderer.removeListener("basichome:auth:session", h);
  },
  // The deployed cloud/api base, owned by the desktop, so the renderer can call
  // /v1/* directly without its own api-base env.
  apiBase: (process.env.BASICS_API_URL || process.env.API_BASE_URL || "https://api.trybasics.ai").replace(/\/+$/, ""),
});
