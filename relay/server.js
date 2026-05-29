// Local-browser relay — the rendezvous that lets a cloud worker drive a user's
// LOCAL Chrome (Model B) without the user installing anything beyond the
// desktop app and without any inbound connection to their machine.
//
// Both sides dial OUT to this relay and are paired by an unguessable,
// per-run `session` id:
//   - desktop (role=desktop): the Basichome desktop app. It opens a local CDP
//     Chrome and pipes that browser-level CDP socket through here. Must present
//     a valid workspace JWT (HS256) → the session is bound to that workspace,
//     so a worker can only ever reach the matching user's machine (honors the
//     "agents never cross workspaces" rule; session ids are run-scoped + random).
//   - worker (role=worker): the cloud agent run. It speaks raw CDP exactly as
//     it would to Browserbase; the relay forwards bytes to the paired desktop.
//
// The relay is a dumb, stateless byte-pump: it never parses, stores, or logs
// CDP payloads (no screenshots/DOM persisted anywhere) — it just pairs and
// pipes, then drops the pair on disconnect.

const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8090);
const JWT_SECRET = process.env.WORKSPACE_JWT_SECRET || "";
const REQUIRE_JWT = process.env.RELAY_REQUIRE_JWT !== "0"; // default on; set 0 for local dev

/** sessions: id -> { workspaceId, desktop?: ws, worker?: ws } */
const sessions = new Map();

function b64urlJson(seg) {
  try {
    return JSON.parse(Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Minimal HS256 verify (no extra deps). Returns claims or null. */
function verifyJwt(token) {
  if (!token || !JWT_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const claims = b64urlJson(p);
  if (!claims) return null;
  if (claims.exp && Date.now() / 1000 > claims.exp) return null;
  return claims;
}

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith("/health")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessions: sessions.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 * 1024 });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://relay.local");
  const role = url.searchParams.get("role");
  const session = url.searchParams.get("session");
  const token = url.searchParams.get("token") || "";

  if (!session || (role !== "desktop" && role !== "worker")) {
    ws.close(1008, "bad params");
    return;
  }

  // The desktop side proves workspace identity; the worker side is reached only
  // by knowing the run-scoped session id (issued server-side per run).
  let workspaceId = null;
  if (role === "desktop") {
    if (REQUIRE_JWT) {
      const claims = verifyJwt(token);
      if (!claims || !claims.workspace_id) {
        ws.close(1008, "unauthorized");
        return;
      }
      workspaceId = claims.workspace_id;
    }
  }

  let s = sessions.get(session);
  if (!s) {
    s = { workspaceId: workspaceId ?? null };
    sessions.set(session, s);
  } else if (role === "desktop" && workspaceId) {
    s.workspaceId = workspaceId;
  }
  if (s[role]) {
    // a second connection for the same role replaces the old one
    try {
      s[role].close(1000, "replaced");
    } catch {
      /* ignore */
    }
  }
  s[role] = ws;
  ws.binaryType = "nodebuffer";

  const peer = () => {
    const cur = sessions.get(session) || {};
    return role === "desktop" ? cur.worker : cur.desktop;
  };

  ws.on("message", (data, isBinary) => {
    const p = peer();
    if (p && p.readyState === 1) p.send(data, { binary: isBinary });
  });
  ws.on("close", () => {
    const cur = sessions.get(session);
    if (!cur) return;
    const other = role === "desktop" ? cur.worker : cur.desktop;
    if (other && other.readyState === 1) {
      try {
        other.close(1000, "peer-closed");
      } catch {
        /* ignore */
      }
    }
    delete cur[role];
    if (!cur.desktop && !cur.worker) sessions.delete(session);
  });
  ws.on("error", () => {
    /* dumb pump: ignore, close handler cleans up */
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`local-browser-relay listening on :${PORT} (requireJwt=${REQUIRE_JWT})`);
});
