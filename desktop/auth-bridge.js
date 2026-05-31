// Web-bridge sign-in ("Sign in via browser" — the Wispr/Linear model).
//
// The app opens the landing site's /desktop-login-bridge page in the user's real
// browser. After they sign in there (Google / Microsoft / SSO / email+password),
// that page POSTs the resolved Supabase session back to this loopback on a FIXED
// port. We hand it to the renderer, which calls supabase.auth.setSession — so the
// session is established INSIDE the app without any credentials ever being typed
// into the Electron window.
//
// The landing page already speaks this protocol (src/app/desktop-login-bridge):
// it tries POST http://127.0.0.1:34567/auth-session first, then falls back to the
// basicsoftware-app:// URL scheme.
const http = require("http");
const { shell } = require("electron");

const BRIDGE_PORT = 34567;

let server = null;

function stopBridge() {
  if (server) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    server = null;
  }
}

/**
 * Open the landing bridge in the system browser and listen for the session POST.
 * `onResult({ access_token, refresh_token })` on success, or `onResult({ error })`.
 * `landingUrl` is the landing origin (e.g. https://trybasics.ai, or localhost:3100
 * in dev). Called once.
 */
function startBrowserSignIn(landingUrl, onResult) {
  stopBridge();
  const base = (landingUrl || "https://basicsoftware.ai").replace(/\/+$/, "");
  let settled = false;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    onResult(result);
    setTimeout(stopBridge, 500);
  };

  server = http.createServer((req, res) => {
    // The POST comes cross-origin from the landing page → allow it.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    let pathname = "/";
    try {
      pathname = new URL(req.url, `http://127.0.0.1:${BRIDGE_PORT}`).pathname;
    } catch {
      /* ignore */
    }
    if (req.method !== "POST" || pathname !== "/auth-session") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      let session = null;
      try {
        session = JSON.parse(body);
      } catch {
        /* ignore */
      }
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      if (session && session.access_token && session.refresh_token) {
        finish({ access_token: session.access_token, refresh_token: session.refresh_token });
      }
    });
  });

  server.on("error", (err) => finish({ error: err && err.message }));
  server.listen(BRIDGE_PORT, "127.0.0.1", () => {
    const target = `${base}/desktop-login-bridge?desktopAuthPort=${BRIDGE_PORT}`;
    shell.openExternal(target).catch((err) => finish({ error: err && err.message }));
  });
}

module.exports = { startBrowserSignIn, stopBridge, BRIDGE_PORT };
