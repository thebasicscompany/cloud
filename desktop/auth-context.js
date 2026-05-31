// Shared workspace auth context for the desktop loops (computer-use watcher +
// loop, Lens). It yields { apiBase, token, workspaceId, userId, userRole }:
//   - apiBase = the deployed cloud/api base (the backend stays hosted)
//   - token   = a short-lived workspace JWT minted by cloud/api POST /v1/auth/token
//
// PRIMARY source: the renderer holds the Supabase session, exchanges it for a
// workspace JWT (cloud/api /v1/auth/token), and pushes it here over IPC
// (setToken). The desktop only READS the JWT's claims — it never mints — so no
// WORKSPACE_JWT_SECRET and no Supabase service-role key ever live in the desktop
// process or its bundle. This replaces the dev /api/lens/context bootstrap, which
// minted a token for a hardcoded PRIMARY_WORKSPACE_ID with no real sign-in.
//
// TRANSITIONAL fallback: until the renderer bridge is the sole source (and the
// web app is bundled with no /api routes), if no token has been pushed we fetch
// the old /api/lens/context bootstrap from the local web app. Both paths yield
// the SAME shape (cloud/api base + a workspace JWT), so callers are unaffected.

const APP_URL = process.env.BASICS_APP_URL || "http://localhost:3000";
const DEFAULT_API_BASE = "https://api.trybasics.ai";

let _pushed = null; // { token, userRole } pushed by the renderer
let _cached = null; // last resolved context

function apiBase() {
  return (process.env.BASICS_API_URL || DEFAULT_API_BASE).trim().replace(/\/+$/, "");
}

// Read a JWT's claims WITHOUT verifying — cloud/api verifies the signature; the
// desktop only needs to know which workspace/account the token is scoped to.
function decodeClaims(token) {
  try {
    const seg = String(token).split(".")[1];
    if (!seg) return {};
    const json = Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
}

function fromToken(token, userRole) {
  const c = decodeClaims(token);
  return {
    apiBase: apiBase(),
    token,
    workspaceId: c.workspace_id || "",
    userId: c.account_id || "",
    userRole: userRole || "pm",
    expMs: typeof c.exp === "number" ? c.exp * 1000 : 0,
  };
}

function valid(ctx) {
  return Boolean(ctx && ctx.token) && (!ctx.expMs || ctx.expMs > Date.now() + 30_000);
}

/** Renderer pushes a freshly-minted workspace JWT (and the user's role hint). */
function setToken(payload) {
  const token = payload && payload.token;
  if (!token) return;
  _pushed = { token, userRole: (payload && payload.userRole) || "pm" };
  _cached = fromToken(token, _pushed.userRole);
}

/** Renderer signed out — drop the token. */
function clearToken() {
  _pushed = null;
  _cached = null;
}

/** Resolve the current context. Pushed JWT first; transitional web fallback. */
async function resolveContext() {
  if (valid(_cached)) return _cached;
  if (_pushed) {
    const ctx = fromToken(_pushed.token, _pushed.userRole);
    if (valid(ctx)) {
      _cached = ctx;
      return _cached;
    }
  }
  // Transitional fallback: dev /api/lens/context (web mints the JWT + api base).
  try {
    const r = await fetch(`${APP_URL}/api/lens/context`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      _cached = {
        apiBase: (j.apiBase || apiBase()).replace(/\/+$/, ""),
        token: j.token || "",
        workspaceId: j.workspaceId || "",
        userId: j.userId || "",
        userRole: j.userRole || "pm",
        expMs: 0,
      };
      return _cached;
    }
  } catch {
    /* keep any prior context */
  }
  return _cached || { apiBase: apiBase(), token: "", workspaceId: "", userId: "", userRole: "pm", expMs: 0 };
}

/** True once we have (or can get) a usable workspace token. */
function hasToken() {
  return valid(_cached) || Boolean(_pushed);
}

/**
 * Whether to route the computer-use QUEUE + RECIPE to cloud/api
 * (/v1/computer/{next,:id/result,recipe}). ON by default now that those
 * endpoints are deployed + verified — the desktop talks to cloud/api directly
 * (the renderer's DesktopAuthBridge supplies the workspace JWT). Set
 * BASICS_USE_CLOUD_QUEUE=0 to force the legacy web-route path during local dev.
 */
function cloudEnabled() {
  return process.env.BASICS_USE_CLOUD_QUEUE !== "0";
}

module.exports = { setToken, clearToken, resolveContext, hasToken, apiBase, cloudEnabled };
