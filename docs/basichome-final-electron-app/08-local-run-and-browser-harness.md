# Local Run Mode & Browser-Harness (what a downloaded user gets)

This answers: *"when a new user downloads the Electron app, what does a LOCAL
run use, and how does the browser-harness / remote-debugging path work?"*

## The shell is the web app

The desktop app is **Electron wrapping the `cloud/web` renderer** (`desktop/`).
The web app *is* the product UI; the shell adds a native window, a tray, and a
global shortcut. The "pill" is the web app's in-app overlay component, **not** a
separate Electron window. This is why it's cross-platform (macOS + Windows) with
one codebase — the native Swift client (`thebasicscompany/client`) is macOS-only,
so Electron-over-web is the portable path.

## Two run modes

| Mode | Browser | Engine runs | Auth/cookies | Use for |
|---|---|---|---|---|
| **Cloud** | Browserbase (cloud Chrome) | Basics Cloud worker (ECS) | `workspace_browser_sites` saved state | scheduled, overnight, shared, durable |
| **Local** | the user's **own Chrome via CDP** | local agent subprocess on the user's machine | the user's real logged-in Chrome cookies | interactive, "use my browser", free-ish |

Both are powered by **Basics-managed API keys** (metered/charged per workspace),
and both save learned **skills/helpers to Basics cloud** (`cloud_skills`,
`cloud_agent_helpers`) so the agent improves across machines and runs.

## What a local run uses (the browser-harness path)

A local run is the same pattern as the `browser-harness` skill: drive a real
Chrome over the **Chrome DevTools Protocol** (CDP) on a remote-debugging port.

The desktop app manages this so the user configures **nothing**:

1. **Agent runtime** — the app bundles/installs the same runtime the cloud
   worker uses: the **opencode CLI** + the **browser-harness plugin** (the
   worker image bakes opencode at `/usr/local/bin/opencode` and imports
   `@basics/harness`; on desktop these ship inside the app's resources, or are
   fetched into app-data on first run, pinned to a known version).
2. **Chrome under CDP** — `desktop/local-browser.js` (`ensureLocalBrowser`):
   - **managed** (default): launches a dedicated Chrome with
     `--remote-debugging-port=<port>` + an isolated `--user-data-dir`
     (`basichome-managed-chrome`). Keeps automation separate from the user's tabs.
   - **attach**: connects to the user's already-running Chrome *iff* it was
     started with `--remote-debugging-port` (explicit opt-in — uses their real
     cookies/sessions). The app shows the one-time instruction only in this mode.
   - it resolves the CDP websocket via `http://127.0.0.1:<port>/json/version`.
3. **Execution** — the local agent subprocess is pointed at that CDP endpoint
   (`LOCAL_CDP_URL`) and runs the loop locally; tool calls/screenshots stream
   back to the renderer over IPC, exactly like a cloud run streams over SSE.
4. **Keys & skills** — LLM calls go through Basics-managed keys (metered);
   skills/helpers written during the run sync to Basics cloud.

### Do users ever touch remote-debugging flags?

No, in **managed** mode (the default) — the app launches Chrome with the debug
port itself. Only **attach mode** ("use my exact Chrome with my logins")
requires the user to start Chrome once with
`--remote-debugging-port=9222`, and the app surfaces that instruction inline
(per-OS) plus an "attach" button that verifies the port.

## Status

- ✅ Built: `desktop/local-browser.js` — cross-platform Chrome discovery
  (macOS/Windows/Linux paths), managed-launch with the debug port, attach mode,
  and CDP-endpoint resolution.
- ▶ Next: bundle the opencode + browser-harness runtime into the desktop
  resources, add the IPC seam (`basichome:run:local`) that spawns it against
  `LOCAL_CDP_URL`, and a renderer toggle (Local vs Cloud) on the run composer.
- The cloud path (Browserbase) is already live end-to-end (real runs execute).
