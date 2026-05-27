# Basics demo

A scripted, non-functional walkthrough of Basics built for **video recording**.
It dramatizes two trades-business automations end-to-end:

1. **End-of-day invoicing + review chase** — 6pm cron pulls today's completed
   jobs from "JobBoard Pro", drafts QuickBooks invoices for unpaid balances,
   drafts review-request SMS for completed jobs, surfaces each for one-tap
   approval, then runs the second one auto-approved via a trust grant.
2. **New lead intake → quote SMS** — website form webhook fires, agent looks
   up the address in Google Maps, pulls comparable past jobs in the
   neighborhood, drafts a personalized quote SMS, surfaces for approval.

The mock business is "Acme Home Services" (generic multi-trade — HVAC,
plumbing, electrical) and the mock field-service app is "JobBoard Pro"
(invented, not tied to a real vendor).

Nothing here actually talks to the cloud. It's a scripted state machine
running in the browser.

## Run

```
cd demo
pnpm install     # or npm install / bun install
pnpm dev
```

Open http://127.0.0.1:5173/. The demo starts playing automatically.

## Controls

- **Spacebar** — play/pause
- **R** — reset to beginning
- **Click the progress bar** — seek
- **0.5x / 1x / 2x** — playback speed (use 0.5x for narrated voiceover, 2x for
  fast preview)
- The playback bar dims when your mouse leaves it, so the recording frame
  stays clean.

## Total runtime

~1:48 at 1x. Chapters in the scrubber:

1. Welcome to Basics
2. Build an automation by describing it
3. 6:00 PM — automation fires
4. Review-request SMS
5. Self-learning
6. A new lead just landed
7. New lead submitted
8. Personalized quote
9. That's Basics.

## File layout

```
demo/
├── src/
│   ├── App.tsx                  — engine + view router
│   ├── store.ts                 — zustand store (one source of truth)
│   ├── script.ts                — the screenplay; every beat with absolute ms
│   ├── index.css                — Tailwind v4 + theme tokens (OKLCH)
│   ├── main.tsx
│   └── components/
│       ├── TopBar.tsx, Sidebar.tsx, PlaybackBar.tsx, Toast.tsx
│       ├── AuthoringPanel.tsx   — chat + agent activity rail
│       ├── AutomationsPanel.tsx — "your automations"
│       ├── RunPanel.tsx         — live-view + tool timeline
│       ├── LiveView.tsx         — fake Chromium chrome around mocks
│       ├── ApprovalOverlay.tsx  — the modal that pings phone + dashboard
│       ├── OutputsPanel.tsx, SkillsPanel.tsx, ApprovalsPanel.tsx
│       └── mocks/
│           ├── JobBoardPro.tsx  — generic field-service SaaS mock
│           ├── QuickBooks.tsx   — invoice draft mock
│           ├── Gmail.tsx        — compose pane mock
│           ├── LeadForm.tsx     — incoming webhook payload mock
│           ├── GoogleMaps.tsx   — address + comparable jobs mock
│           └── Sms.tsx          — iPhone-style outbound SMS mock
└── package.json
```

## Editing the screenplay

`src/script.ts` is one flat array of `Beat` objects, each with an absolute
`t` (ms from start). To add or move a moment, edit the array — there is no
DSL or compile step.

- `chapter:` makes the beat a scrubber chapter (tick on the timeline).
- `label:` is shown when the cursor hovers the timeline.
- `patch:` shallow-merges into the zustand store.
- `do:` runs imperative actions (kicking off tool calls, appending chat
  messages, scheduling delayed completions, etc.).

Adjusting timing is just editing milliseconds. Re-record after every tweak;
playback is deterministic.
