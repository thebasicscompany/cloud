# What the demo is automating

The demo dramatizes the daily reality of a small trades shop ("Acme Home Services" — multi-trade HVAC / plumbing / electrical) and shows how Basics replaces two hours of administrative drudgery a day.

Two stories play back-to-back. Both follow the same five-act shape — **describe → propose → activate → fire → approve → sent** — because that's what the product actually does. The job of the demo is to make that shape obvious in 1 minute 48 seconds.

---

## Story 1 — End-of-day invoicing + review chase

> A scheduled automation. Fires every weekday at 6:00 PM, after the last truck rolls in. Owner sees nothing on their phone — Basics is already working.

### The pain it solves

Every evening, a shop owner has the same 30-minute task:

1. Open the field-service app, look at today's completed jobs.
2. For any unpaid jobs, open QuickBooks (or whichever bookkeeping tool), draft an invoice from the job notes, email it to the customer.
3. For any newly-completed job, type out a review-request SMS so they can grow on Google.

This is high-volume, low-creativity work. It's also work that gets skipped when the owner is tired, which means slow cash flow and a thin review profile.

### What the owner says into the chat

> *"every weekday at 6pm, pull today's completed jobs from jobboard pro. for any with unpaid balances, draft invoice emails through quickbooks. for any newly-completed job, draft a 'leave us a google review' text. show me everything before it goes out — i want one tap to approve."*

That's the entire build interaction. No drag-and-drop builder, no workflow editor, no per-step configuration. Plain English, like talking to a new dispatcher.

### What Basics does behind the scenes

| Step | Tool call | What it represents |
|---|---|---|
| 1 | `composio_list_tools` | Inspects the workspace's connected toolkits (Gmail, QuickBooks, SMS) to confirm the automation is buildable. |
| 2 | `helper_call(skill_loader)` | Loads 2 saved playbooks the workspace already had for `app.jobboardpro.com` — "job-status extraction" and "QuickBooks invoice flow" — so the next run is faster + cheaper than starting from scratch. |
| 3 | `propose_automation` | Drafts the workflow definition: trigger, steps, approval policy, output channels. |
| 4 | `activate_automation` | Wires up the EventBridge cron (`0 18 * * 1-5`), stores the playbook, returns "first run today at 6:00 PM". |

### What the owner watches at 6:00 PM

The clock in the topbar advances to 6:00 PM. The view switches to "Live run" — a real cloud Chrome (Browserbase) opens JobBoard Pro at the workspace's saved login. The owner sees the agent's cursor (the green ring) move through the UI in real time, the same way they'd watch over a new hire's shoulder.

| Tool call | What's visible | Output |
|---|---|---|
| `goto_url("app.jobboardpro.com/today")` | The job board loads. | — |
| `screenshot()` | Agent captures the page state. | — |
| `extract({status:"completed"})` | Agent pulls 3 completed jobs. 2 have unpaid balances. | — |
| `click_at_xy(360, 260)` | Opens job J-4178 (James Reeves, water heater install, $1,840). | — |
| `composio_call(quickbooks.create_invoice)` | Switches to QuickBooks Online, drafts invoice INV-2041. | Invoice draft |
| `send_email(jreeves@gmail.com)` | Composes the email. **Pauses for approval.** | Awaiting tap |

**The approval moment.** The action pauses. Basics simultaneously texts the owner's phone (Sendblue, +1-412-555-0186) AND raises an approval modal on the dashboard. Whichever channel the owner taps first wins; the other auto-resolves. The "remember this" checkbox creates a narrow trust grant: "auto-approve `send_email` from this automation when the recipient is a customer billing address." Narrow by default; revokable anytime.

**The second invoice (Sarah Chen, AC tune-up, $245)** runs through with no prompt — the trust grant the owner just created covers it. This is the moat: every prompt the owner approves makes the next run that much more unattended.

**The review-request SMS batch** drafts three texts (to James, Sarah, and Marcus from yesterday's panel-upgrade job). Each is personalized — first name, the job they just did, a 5-star nudge, a short link. One tap approves all three.

**The self-learning moment.** Right before completing, the agent calls `skill_write` to save a new playbook: `"end-of-day batch flow"`. Confidence 95%. It's stamped "just learned" in the Skills tab. The next run won't need to reason about the order of operations from scratch.

### What the owner has at 6:01 PM

```
3 jobs processed         2 invoices drafted, sent       3 review SMS, sent
1 minute of agent time   $0.14 of compute               0 keystrokes from the owner
```

5 outputs, all approved, all auditable. Run took 47 seconds. The owner can now go to dinner.

---

## Story 2 — New lead intake → personalized quote SMS

> A webhook automation. Fires the moment a quote-request form is submitted on the company website. The goal: hit the lead within 30 seconds, with context, while the competitor is still looking up the address.

### The pain it solves

Speed-to-lead is the #1 predictor of close rate in the trades. Most shops respond in 30–90 minutes — by which point the customer has called two competitors. Basics can text back, with context, in under 20 seconds.

### What the owner adds to the chat

> *"also — when a new lead form comes in from our website, look up the address, pull comparable jobs we've quoted at similar homes, and draft a personalized text quote. same approval flow."*

### What the webhook brings in

```json
{
  "lead": {
    "name": "Sarah Maddox",
    "phone": "(412) 555-0117",
    "address": "218 Maple St, Pittsburgh PA",
    "problem": "AC stopped cooling. House is 92°F upstairs. Two kids, urgent if possible today.",
    "urgency": "today_if_possible"
  }
}
```

### What Basics does

| Tool call | What it represents | What the live view shows |
|---|---|---|
| `goto_url("maps.google.com")` | Looks up the address for neighborhood + property context. | Google Maps with a pin on Maple St. |
| `extract({house_size, year_built})` | Squirrel Hill, 1953, 1,940 sqft. "Older home — likely original ductwork." | Property card popup. |
| `helper_call(find_comparable_jobs)` | Queries JobBoard Pro for past jobs in this neighborhood with similar problems. **3 jobs in 90 days, avg $385, 2 same-day capacitor fixes.** | Comparable jobs list. |
| `send_sms(+1-412-555-0117)` | Drafts a personalized quote. Pauses for approval. | An iPhone iMessage UI typing the bubble in real time. |

### What the quote SMS says

> *"Hi Sarah — Mike at Acme Home Services. Just saw your form come in. With the kids and 92° upstairs, I get the urgency. Most AC-stopped-cooling calls we run in Squirrel Hill turn out to be a capacitor — same-day fix, usually $325–$425 all-in. I can have a tech at 218 Maple by 4:30 today if that works. Reply YES and I'll lock it."*

The text isn't generic. It mentions:

- The kids and the heat (from the form).
- Squirrel Hill (from the maps lookup).
- The likely cause — capacitor — and the price band (from the comparable-jobs lookup).
- A concrete time slot (4:30 today).
- A one-keystroke acceptance path ("Reply YES").

Approval modal pings the owner's phone. One tap. Sent.

**Lead-to-quote in 14 seconds.** The next-best competitor calls back tomorrow.

---

## What's deliberately *not* in the demo

A few omissions are pedagogical, not technical:

- **No prompt engineering.** The owner never sees a system prompt, a model picker, or a temperature slider. They describe what they want; Basics builds it.
- **No multi-step approval policies.** Real production has rules like "if amount > $5,000 require two approvals" — kept out of the demo to not distract from the core loop.
- **No live take-over.** The Basics product supports take-over (the owner can grab the cloud Chrome mid-run and drive it manually); the demo skips this because the runs go well.
- **No drift handling.** If JobBoard Pro changes their button layout, Basics would pause and ask. The demo runs against a stable mock.

---

## What the demo is mapping to, in the real product

Each visual element of the demo corresponds to a real piece of the `cloud/` runtime. None of it is invented:

| Demo element | Real product backing |
|---|---|
| Authoring chat | `POST /v1/workspaces/:wsId/authoring/messages` — Opus 4.7 with full worker tool registry. |
| Live-view iframe | Browserbase `liveUrl` streamed via SSE through `api.trybasics.ai/v1/runs/:id/events`. |
| Tool timeline | `agent_activity` rows from the worker, fanned out via Supabase Realtime. |
| Skills | `public.cloud_skills` table — per-workspace, host-keyed, loaded automatically before any tool call against that host. |
| Helpers | `public.cloud_agent_helpers` — TypeScript modules the agent writes and the next run calls via `helper_call`. |
| Approvals | `approvals` table, Sendblue SMS + Supabase Realtime SSE for dual-channel dispatch. |
| Trust grants | `approval_rules` rows — narrow by toolkit + parameter constraints. |
| Browser sites (saved logins) | `workspace_browser_sites` — Playwright `storageState` blobs keyed by `(workspace_id, host)`. |
| Schedule | EventBridge Scheduler → SQS → dispatcher Lambda → per-workspace ECS Fargate worker. |
| Webhook trigger | `POST /webhooks/composio` for OAuth toolkits, or a workspace-specific HMAC webhook for the company's own forms. |

Everything above already runs in production. The demo is faithful to what the product does — it just compresses a real 47-second run into 47 seconds of polished, scriptable playback.

---

## Why this video, why now

Trades shops are skeptical of AI for good reasons — most demos they've seen are flashy ChatGPT tricks that don't survive contact with their actual tools. The point of this video is to show, in their language, with their tools, with their kind of jobs:

1. **Description, not configuration.** They told Basics what they wanted in three sentences.
2. **Approval, not autonomy.** Nothing left the workspace without a tap.
3. **Verifiable outcomes.** Five real drafts, in the inbox, by 6:01 PM.
4. **It gets cheaper.** Every run writes a skill, every approval writes a trust grant. By month three, runs are mostly unattended and cost a few cents.

That's the wedge.
