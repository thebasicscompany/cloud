// External-browser OAuth for the desktop app.
//
// Embedded webviews are blocked by Google (disallowed_useragent) and feel wrong,
// so sign-in opens in the user's real browser. The OAuth `redirectTo` points at
// a one-shot loopback server we run here on a FIXED port; when the browser lands
// on it with the auth `code`, we hand that code back to the renderer over IPC.
// The renderer (which holds the PKCE verifier from signInWithOAuth) then calls
// exchangeCodeForSession — so the session is established INSIDE the app, not in
// the external browser.
//
// Supabase must allowlist this redirect URL: add
//   http://127.0.0.1:38765/callback
// under Authentication → URL Configuration → Redirect URLs.
const http = require("http");
const { shell } = require("electron");

const AUTH_PORT = 38765;
const REDIRECT_URI = `http://127.0.0.1:${AUTH_PORT}/callback`;

let server = null;

function stopAuthServer() {
  if (server) {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    server = null;
  }
}

function page(title, sub) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Basics</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#0b0b0c;color:#fafafa">
<div style="text-align:center;max-width:420px;padding:24px">
<div style="font-size:20px;font-weight:600;margin-bottom:8px">${title}</div>
<div style="opacity:.65;font-size:14px">${sub}</div>
</div></body></html>`;
}

/**
 * Open `url` in the system browser and resolve the auth code (or error) via the
 * loopback redirect. `onResult({ code, error })` is called once.
 */
function openExternalAuth(url, onResult) {
  stopAuthServer();
  let settled = false;
  const finish = (result) => {
    if (settled) return;
    settled = true;
    onResult(result);
    setTimeout(stopAuthServer, 250);
  };

  server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, REDIRECT_URI);
      if (u.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = u.searchParams.get("code");
      const error = u.searchParams.get("error_description") || u.searchParams.get("error");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        code
          ? page("Signed in to Basics", "You can close this tab and return to the app.")
          : page("Sign-in didn’t complete", error || "Please try again from the app."),
      );
      finish({ code: code || null, error: error || null });
    } catch {
      try {
        res.end("ok");
      } catch {
        /* ignore */
      }
    }
  });

  server.on("error", (err) => {
    finish({ code: null, error: `auth callback server failed: ${err && err.message}` });
  });

  server.listen(AUTH_PORT, "127.0.0.1", () => {
    shell.openExternal(url).catch((err) => finish({ code: null, error: err && err.message }));
  });
}

module.exports = { openExternalAuth, stopAuthServer, AUTH_PORT, REDIRECT_URI };
