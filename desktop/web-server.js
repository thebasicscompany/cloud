// Bundled Next.js renderer host.
//
// The cloud/web renderer is shipped INSIDE this Electron app as a Next.js
// "standalone" build (next.config.mjs → output: "standalone"). Instead of
// loading a hosted URL, we spawn that standalone server.js as a child process
// — reusing Electron's own binary as Node (ELECTRON_RUN_AS_NODE=1) so there's
// no separate Node runtime to ship — and hand the local URL back to main.js.
//
// Nothing secret is passed to the child. The renderer talks to cloud/api with a
// per-user JWT (minted in the renderer), so the only env it needs is the public
// API base. server.js binds 127.0.0.1:<PORT>; we wait until that port accepts a
// TCP connection before returning, so no window ever loadURL()s a dead server.
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

let child = null;

// Locate the standalone server entry. Packaged builds land it at
// resources/web/server.js (see electron-builder extraResources); a dev-bundle
// run (electron . without packaging, after `next build`) finds it under the
// sibling web workspace's .next/standalone output.
function resolveServerJsPath() {
  const candidates = [
    // Packaged: electron-builder flattens the standalone's web/ subdir to
    // resources/web/ (server.js + node_modules + .next/static + public).
    path.join(process.resourcesPath || "", "web", "server.js"),
    // Dev-bundle (electron . after `next build`): the monorepo standalone output
    // nests the entry at .next/standalone/web/server.js (node_modules sits at the
    // standalone root and resolves up the tree).
    path.join(__dirname, "..", "web", ".next", "standalone", "web", "server.js"),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// Grab a free ephemeral port from the OS (bind to :0, read the assigned port,
// release it). There's a tiny TOCTOU window before the child re-binds it, so
// the caller's connect-poll is still the real readiness gate.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Resolve once the port accepts a TCP connection, reject after `timeoutMs`.
function waitForPort(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (child && child.exitCode !== null) {
          reject(new Error(`web server exited (code ${child.exitCode}) before accepting connections`));
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error(`web server did not accept connections on port ${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

// Spawn the bundled Next standalone server and resolve to its local URL once
// it's accepting connections. Idempotent-ish: if a child is already running we
// don't double-spawn (returns a rejected promise so callers notice misuse).
async function startWebServer() {
  const serverJsPath = resolveServerJsPath();
  if (!serverJsPath) {
    throw new Error(
      "bundled web server not found (looked for resources/web/server.js and ../web/.next/standalone/server.js) — run `pnpm run bundle:web`",
    );
  }

  const port = await getFreePort();

  child = spawn(process.execPath, [serverJsPath], {
    // Run Electron's binary as plain Node so we don't ship a second runtime.
    // server.js reads PORT/HOSTNAME; the renderer reads API_BASE_URL (public).
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      API_BASE_URL: process.env.BASICS_API_URL || process.env.API_BASE_URL || "https://api.trybasics.ai",
    },
    // server.js cwd determines where it resolves .next/static + public from;
    // standalone output co-locates them next to server.js.
    cwd: path.dirname(serverJsPath),
    stdio: ["ignore", "inherit", "inherit"],
  });

  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[web-server] standalone server exited code=${code} signal=${signal || ""}`);
    }
    child = null;
  });
  child.on("error", (err) => {
    console.error("[web-server] failed to spawn standalone server:", err && err.message);
  });

  await waitForPort(port);
  return `http://127.0.0.1:${port}`;
}

function stopWebServer() {
  if (child) {
    try {
      child.kill();
    } catch {
      /* best-effort */
    }
    child = null;
  }
}

module.exports = { startWebServer, stopWebServer };
