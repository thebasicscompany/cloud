# Basichome UX Vision & Architecture (what we want, and what this is)

Consolidated from: the concept demo video (youtube `UxQrl7JdCDo`, 25 frames
captured to `basicsHome/docs/screenshots/demo-video/`), the `thebasicscompany/client`
repo, the `thebasicscompany/tidbit-dashboard` repo, and the cloud `demo/` folder.

## What this app actually is (the questions answered)

- **localhost:3000** = the `cloud/web` Next.js dashboard. It is the **renderer** —
  the product UI itself.
- **Is it an Electron app we're serving on web right now?** Yes. The web app *is*
  the product; `desktop/` is a thin Electron shell that loads that same renderer
  in a native window (macOS + Windows) + tray + global shortcut. During dev we run
  the renderer on localhost; the shell points at it. There is **no second UI** —
  the "pill" is the web app's in-app overlay, not a separate Electron window.
- **Where is it deployed?** The **backend API + worker + infra** are deployed on
  AWS (SST: ALB `RuntimeApiLoadB-…elb.amazonaws.com`, ECS Fargate, SQS, Lambdas,
  Supabase = the `Basics` project). The **dashboard is not yet hosted** for end
  users — it's either Electron-wrapped (desktop) or would be hosted as the Next
  app. `api.trybasics.ai` is one redeploy away (cert pre-requested; needs 2 Vercel
  DNS records).
- **Why Mac-specific icons/permissions?** The product was **Mac-first** — the real
  native client (`client/clients/macos`) is a Swift menu-bar app, so onboarding
  used macOS TCC names. **Fixed:** onboarding is now OS-aware (Mac: Screen
  Recording/Accessibility/Input Monitoring; Windows: screen capture/input/mic,
  "asked at use-time").

## The UX we want (from the demo + tidbit)

The product is **ambient and operational, not a chat app.** The defining decision
(confirmed by tidbit-dashboard, which has **zero chat**): the human's job is
**review → confirm / edit / dismiss**, not converse.

- **Home = calm + command-first.** Demo home: a centered *"Press ⌘+G to talk to
  the agent"*, a **"Your agents"** grid (Email Summarizer, Daily Digest, …), and
  **"Recent documents / work."** Chat is a tiny affordance, not the surface.
  → Implemented: home redesigned to hero (talk-to-agent) + Your agents (real
  automations) + Recent work (real runs); the dense cockpit was removed.
- **Agent working = a quiet top-center pill** while it drives apps/browser
  off-screen. The pill shows status; the main window owns deep management.
- **The loop** (cloud `demo/`): **describe → propose → activate → fire → approve →
  sent.** "Accept" = an approval modal with the exact action preview + Approve/Deny
  + a "remember this" narrow **trust grant**, raised on the dashboard *and* texted
  to the phone.
- **Confidence + trust framing everywhere** (tidbit): high/medium/low pills,
  "why this is surfaced," "nothing leaves this device unless you confirm."

## Recording + pill flow (the client app)

The real recording lives in `client/clients/macos` and is what we mirror:
- **Two HUD pills**, deliberately distinct: `RecordingHUDWindow` (chat-attachment
  recorder: pause/stop) and `CaptureHUDWindow` (Record-Routine: **dot + timer +
  Stop only**, no pause/voice — intentional restraint).
- **Lens** = an embedded **Rust capture daemon** (`thebasicscompany/lens`),
  **lazily spawned on first Record-Routine click** (zero idle cost, no surprise
  permission prompts). Captures screen/OCR/a11y/app/window/browser-URL → local
  context. **Lens does not execute routines.** Permissions are requested at
  first-use, never at onboarding.
- Triggerable **off-app** (menu bar + global chord) with no window open — the pill
  is the entire UI during a demonstration; Stop opens the captured routine doc.
→ Our status: the in-app overlay pill exists in the web renderer; the **real
  capture/recording = the Lens integration (the final goal #16)**. Not needed for
  any cloud/agent/browser/voice/connections feature already working.

## Repos in play

- `cloud` — web renderer + cloud API/worker/infra + the `demo/` walkthrough. (here)
- `client` — Swift macOS app (recording, pills, computer-use, ambient), the Bun
  `assistant` daemon (HTTP/SSE, tools, OAuth-connect, browser/cookies), and a
  chrome-extension (relays the *local* browser). Source of the desktop contract
  (`docs/DESKTOP-API-REFERENCE.md`).
- `tidbit-dashboard` — the **clean design reference** ("ambient AI" inbox, no chat,
  warm paper palette, Inspector rail, confidence pills). The visual north star.
- `lens` — the on-device capture daemon (final-goal integration).

## How the demo maps onto what's built

| Demo / vision element | Status in cloud/web |
|---|---|
| Calm home: talk-to-agent + Your agents + Recent work | ✅ done |
| Minimal chat / ambient | ✅ Conversations de-emphasized; review-first |
| Pill while agent works off-app | ◑ in-app overlay; native pill = Lens phase |
| describe→propose→activate→fire→approve→sent | ◑ runs + approvals real; live approval modal = next |
| Real agent runs (cloud) | ✅ execute end-to-end (Browserbase) |
| Connections (Composio) + cookies→cloud-browser | ✅ Composio connect live (Gmail ACTIVE); cookie login wired |
| Voice "talk to it" | ✅ Deepgram temp-key mic → prompt |
| Recording / local context (Lens) | ⏭ final goal #16 |
| Cross-platform desktop (Mac+Windows) | ✅ Electron shell wraps the web renderer |
