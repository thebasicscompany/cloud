// Desktop relay client (Model B) — pipes the user's LOCAL Chrome CDP through
// the Basics relay so a cloud worker run can drive it. The desktop dials OUT
// twice (to local Chrome + to the relay) and pumps bytes between them; nothing
// inbound is ever opened on the user's machine.
//
// Electron's main process runs an older Node without a global WebSocket, so we
// use the `ws` package here (the relay server uses it too).
const WebSocket = require("ws");
const { ensureLocalBrowser, stopLocalBrowser } = require("./local-browser");

const WS_OPTS = { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 };
// Dedicated CDP port for the local-relay browser — distinct from the default
// 9222 (which a user's own Chrome / browser-harness often holds) to avoid
// bind conflicts.
const RELAY_BROWSER_PORT = Number(process.env.BASICS_RELAY_BROWSER_PORT || 9333);

let _state = null; // { local, up, session }

function once(ws, evt) {
  return new Promise((resolve, reject) => {
    ws.once(evt, resolve);
    ws.once("error", reject);
  });
}

/**
 * Open a local CDP Chrome and bridge it to the relay under `session`.
 * @param {{relayUrl:string, session:string, token?:string, mode?:string, port?:number}} opts
 */
async function startRelay({ relayUrl, session, token, mode = "managed", port = RELAY_BROWSER_PORT } = {}) {
  if (!relayUrl || !session) throw new Error("relayUrl and session are required");
  // tear down any prior bridge first
  stopRelay();

  const info = await ensureLocalBrowser({ mode, port });
  const local = new WebSocket(info.webSocketDebuggerUrl, WS_OPTS);
  const sep = relayUrl.includes("?") ? "&" : "?";
  const upUrl = `${relayUrl}${sep}role=desktop&session=${encodeURIComponent(session)}&token=${encodeURIComponent(token || "")}`;
  const up = new WebSocket(upUrl, WS_OPTS);

  await Promise.all([once(local, "open"), once(up, "open")]);

  local.on("message", (data, isBinary) => {
    if (up.readyState === WebSocket.OPEN) up.send(data, { binary: isBinary });
  });
  up.on("message", (data, isBinary) => {
    if (local.readyState === WebSocket.OPEN) local.send(data, { binary: isBinary });
  });

  const teardown = () => {
    try {
      local.close();
    } catch {
      /* ignore */
    }
    try {
      up.close();
    } catch {
      /* ignore */
    }
  };
  local.on("close", teardown);
  up.on("close", teardown);
  local.on("error", () => {});
  up.on("error", () => {});

  _state = { local, up, session };
  return { ok: true, session, browser: info.browser, port: info.port };
}

function stopRelay() {
  if (_state) {
    try {
      _state.local.close();
    } catch {
      /* ignore */
    }
    try {
      _state.up.close();
    } catch {
      /* ignore */
    }
    _state = null;
  }
  // also stop the managed Chrome we launched for this bridge
  stopLocalBrowser();
}

module.exports = { startRelay, stopRelay };
