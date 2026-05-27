/* -----------------------------------------------------------------------------
   The screenplay.

   Each beat fires at an absolute timestamp (ms from start of the demo). The
   engine in App.tsx ticks at 60Hz, advances `elapsed = elapsed + dt * speed`,
   and fires every beat whose `t` is <= elapsed and hasn't fired yet. Reverse
   playback isn't supported — to rewind the user resets and plays forward.

   Beats are intentionally hand-authored (vs. computed). On video the timing
   matters and being able to nudge a single beat by 200ms beats any DSL.
----------------------------------------------------------------------------- */

import type { DemoState, ToolCall } from './store'

export interface Beat {
  /** absolute ms from start of demo */
  t: number
  /** one-line label for the scrubber */
  label?: string
  /** chapter heading; if present, becomes the next scrubber chapter */
  chapter?: string
  /** state patch */
  patch?: Partial<DemoState>
  /** imperative action against the store */
  do?: (s: ReturnType<typeof getStore>) => void
}

type StoreApi = {
  patch: DemoState['patch']
  appendChat: DemoState['appendChat']
  growChat: DemoState['growChat']
  upsertToolCall: DemoState['upsertToolCall']
  addOutput: DemoState['addOutput']
  addRunStep: DemoState['addRunStep']
  setToast: DemoState['setToast']
  get: () => DemoState
}
function getStore(): StoreApi {
  // placeholder; the actual instance is passed in at runtime
  return null as unknown as StoreApi
}

/* the text we'll typewriter into the user-chat bubble. Carefully written
   to read like an actual trade-business owner — not a tech demo person. */
const USER_REQUEST_1 = `every weekday at 6pm, pull today's completed jobs from jobboard pro.
for any with unpaid balances, draft invoice emails through quickbooks.
for any newly-completed job, draft a "leave us a google review" text.
show me everything before it goes out — i want one tap to approve.`

const AGENT_THINKING_1 = `got it. let me check what tools you've connected and any past playbooks I can reuse.`

const AGENT_PROPOSAL_1 = `here's what I'm going to build:

  trigger:  weekdays @ 6:00 PM (America/New_York)
  steps:    open JobBoard Pro → today's completed jobs
            for each unpaid → QuickBooks invoice draft (via gmail)
            for each completed → review-request SMS draft
  approval: every email + SMS pauses for your one-tap nod
  outputs:  drafts only — nothing sends without you

look right?`

const AGENT_ACTIVATED_1 = `activated. first run will fire at 6:00 PM today. I'll text you when it's ready for review.`

const USER_REQUEST_2 = `also — when a new lead form comes in from our website, look up the address,
pull comparable jobs we've quoted at similar homes, and draft a personalized
text quote. same approval flow.`

const AGENT_PROPOSAL_2 = `done. webhook is live on the lead form — next submission triggers it.`

/* helpers --------------------------------------------------------------- */
let _id = 0
const nid = (p: string) => `${p}-${++_id}`

function toolStart(s: StoreApi, tool: ToolCall['tool'], label: string, reasoning?: string): string {
  const id = nid('tc')
  s.upsertToolCall({ id, tool, label, reasoning, status: 'running', startedAt: Date.now() })
  return id
}
function toolDone(s: StoreApi, id: string) {
  const tc = s.get().toolCalls.find((t) => t.id === id)
  if (!tc) return
  s.upsertToolCall({ ...tc, status: 'done', endedAt: Date.now() })
}
function toast(s: StoreApi, text: string, kind: 'info' | 'success' | 'warn' = 'info') {
  s.setToast({ text, kind })
  setTimeout(() => {
    if (s.get().toast?.text === text) s.setToast(null)
  }, 3000)
}

/* the screenplay -------------------------------------------------------- */
export const BEATS: Beat[] = [
  /* ============================================================
     ACT 1 — cold open
     ============================================================ */
  {
    t: 0,
    chapter: 'Welcome to Basics',
    label: 'open',
    patch: {
      view: 'automations',
      storyTitle: 'Basics for the trades',
      storySubtitle: 'You demonstrate it once. We run it forever.',
      automations: [],
      clockTime: '5:58 PM',
    },
  },

  /* ============================================================
     ACT 2 — Owner builds the end-of-day automation by typing
     ============================================================ */
  {
    t: 2500,
    chapter: 'Build an automation by describing it',
    label: 'open authoring chat',
    patch: {
      view: 'authoring',
      authoringStatus: 'idle',
      storyTitle: 'Tell Basics what you want',
      storySubtitle: 'No clicking through settings. Just describe it like you would to a new dispatcher.',
    },
    do: (s) => {
      s.appendChat({
        id: 'sys-1',
        role: 'system',
        text: 'Authoring agent ready. Tell me what you want to automate.',
      })
    },
  },

  /* user types message */
  {
    t: 4000,
    label: 'user starts typing',
    do: (s) => {
      s.appendChat({ id: 'u-1', role: 'user', text: USER_REQUEST_1, streamedChars: 0 })
    },
  },
  ...streamCharsBeats('u-1', USER_REQUEST_1, 4000, 9000),

  {
    t: 9400,
    label: 'agent thinking',
    patch: { authoringStatus: 'thinking' },
    do: (s) => {
      s.appendChat({ id: 'a-1', role: 'agent', text: AGENT_THINKING_1, streamedChars: 0 })
    },
  },
  ...streamCharsBeats('a-1', AGENT_THINKING_1, 9400, 11300),

  /* agent calls tools */
  {
    t: 11500,
    label: 'composio_list_tools',
    do: (s) => {
      const id = toolStart(
        s,
        'composio_list_tools',
        'composio_list_tools(toolkits=["gmail","sms","quickbooks"])',
        'checking what you have connected',
      )
      setTimeout(() => toolDone(s, id), 1100)
    },
  },
  {
    t: 13000,
    label: 'load skills',
    do: (s) => {
      const id = toolStart(
        s,
        'helper_call',
        'skill_loader(workspace=acme, host=app.jobboardpro.com)',
        '2 saved skills for this site — reusing them',
      )
      setTimeout(() => toolDone(s, id), 800)
    },
  },
  {
    t: 14200,
    label: 'propose automation',
    do: (s) => {
      const id = toolStart(
        s,
        'propose_automation',
        'propose_automation(name="end-of-day invoicing + reviews")',
      )
      s.appendChat({ id: 'a-2', role: 'agent', text: AGENT_PROPOSAL_1, streamedChars: 0 })
      setTimeout(() => toolDone(s, id), 1500)
    },
  },
  ...streamCharsBeats('a-2', AGENT_PROPOSAL_1, 14400, 19500),

  {
    t: 20000,
    label: 'activate automation',
    do: (s) => {
      const id = toolStart(s, 'activate_automation', 'activate_automation(id=auto-001)')
      setTimeout(() => {
        toolDone(s, id)
        s.patch({
          automations: [
            {
              id: 'auto-001',
              name: 'End-of-day invoicing + review chase',
              description: 'Pull completed jobs → invoice unpaid → request reviews. Drafts only.',
              trigger: 'weekdays @ 6:00 PM',
              status: 'active',
              nextRunAt: 'today at 6:00 PM',
              runCount: 0,
            },
          ],
        })
        toast(s, 'Automation activated. First run today at 6:00 PM.', 'success')
        s.appendChat({ id: 'a-3', role: 'agent', text: AGENT_ACTIVATED_1, streamedChars: 0 })
      }, 1400)
    },
  },
  ...streamCharsBeats('a-3', AGENT_ACTIVATED_1, 22000, 24500),

  /* ============================================================
     ACT 3 — Clock ticks to 6pm; automation fires
     ============================================================ */
  {
    t: 25800,
    chapter: '6:00 PM — automation fires',
    label: 'clock advances',
    patch: {
      clockTime: '5:59 PM',
      storyTitle: 'And then 6 PM rolls around…',
      storySubtitle: 'Nothing on your phone. Basics is already working.',
    },
  },
  { t: 26300, patch: { clockTime: '6:00 PM' } },
  {
    t: 26800,
    label: 'run starts',
    patch: {
      view: 'run',
      activeRun: {
        id: 'run-001',
        automationId: 'auto-001',
        automationName: 'End-of-day invoicing + review chase',
        status: 'running',
        trigger: 'schedule',
        startedAt: '6:00 PM',
      },
      toolCalls: [],
      runSteps: [],
      liveScene: { kind: 'blank' },
    },
    do: (s) => {
      toast(s, 'Run started — End-of-day invoicing + reviews', 'info')
      s.addRunStep({ id: nid('rs'), text: 'Cron trigger fired — workspace task starting', ts: Date.now() })
    },
  },

  /* worker boots */
  {
    t: 27600,
    label: 'browserbase session',
    do: (s) => {
      s.addRunStep({ id: nid('rs'), text: 'Browserbase session attached. Cookies loaded for app.jobboardpro.com', ts: Date.now() })
    },
  },
  {
    t: 28400,
    label: 'goto JobBoard Pro',
    do: (s) => {
      const id = toolStart(s, 'goto_url', 'goto_url("app.jobboardpro.com/today")', 'opening today\'s job board')
      setTimeout(() => {
        toolDone(s, id)
        s.patch({ liveScene: { kind: 'jobboard_dashboard' }, cursor: { x: 200, y: 140, clicking: false } })
      }, 900)
    },
  },
  {
    t: 30000,
    label: 'screenshot',
    do: (s) => {
      const id = toolStart(s, 'screenshot', 'screenshot()')
      setTimeout(() => toolDone(s, id), 500)
    },
  },
  {
    t: 30800,
    label: 'extract completed jobs',
    do: (s) => {
      const id = toolStart(
        s,
        'extract',
        'extract({status: "completed"}) → 3 jobs',
        '3 completed jobs today. 2 have unpaid balances.',
      )
      setTimeout(() => toolDone(s, id), 1100)
    },
  },
  {
    t: 32400,
    label: 'cursor → row 1',
    patch: { cursor: { x: 360, y: 260, clicking: false } },
  },
  { t: 33000, patch: { cursor: { x: 360, y: 260, clicking: true } } },
  {
    t: 33500,
    patch: {
      cursor: { x: 360, y: 260, clicking: false },
      liveScene: { kind: 'jobboard_job_detail', jobId: 'J-4178' },
    },
    do: (s) => {
      const id = toolStart(s, 'click_at_xy', 'click_at_xy(360, 260) — job J-4178')
      setTimeout(() => toolDone(s, id), 700)
    },
  },

  /* ----- invoice draft for J-4178 ----- */
  {
    t: 35500,
    label: 'QuickBooks invoice draft',
    patch: { liveScene: { kind: 'quickbooks_invoice', jobId: 'J-4178' } },
    do: (s) => {
      s.addRunStep({ id: nid('rs'), text: 'J-4178 — Reeves, water heater install — $1,840 unpaid', ts: Date.now() })
      const id = toolStart(
        s,
        'composio_call',
        'composio_call(quickbooks.create_invoice, customer=Reeves, amount=$1840)',
        'using saved QuickBooks invoice flow skill',
      )
      setTimeout(() => toolDone(s, id), 1400)
    },
  },

  /* ----- gmail compose + APPROVAL ----- */
  {
    t: 37400,
    label: 'draft Gmail',
    patch: {
      liveScene: {
        kind: 'gmail_compose',
        subject: 'Invoice #INV-2041 from Acme Home Services',
        to: 'jreeves@gmail.com',
        body:
          'Hi James,\n\nThanks again for trusting us with your water heater install yesterday. Your invoice for $1,840.00 is attached — payment is due within 30 days. You can pay online with the link at the top.\n\nIf anything seems off, just reply to this email or text us at (412) 555-0182.\n\n— The Acme Home Services team',
        typed: 0,
      },
    },
    do: (s) => {
      toolStart(s, 'send_email', 'send_email(to=jreeves@gmail.com, subject="Invoice #INV-2041 …")')
    },
  },
  ...typewriteGmail(37400, 41500),

  {
    t: 41700,
    label: 'pause for approval',
    do: (s) => {
      s.patch({
        pendingApproval: {
          id: 'ap-1',
          toolName: 'send_email',
          title: 'Send invoice email to James Reeves?',
          preview:
            'To: jreeves@gmail.com\nSubject: Invoice #INV-2041 from Acme Home Services\n\nHi James, Thanks again for trusting us with your water heater install yesterday…',
          riskLine: 'This sends a real email and creates a paid invoice in QuickBooks.',
          requestedAt: Date.now(),
          status: 'pending',
        },
      })
      toast(s, 'Approval requested — texted to your phone', 'warn')
    },
  },

  /* simulate the owner tapping Approve on their phone */
  {
    t: 45000,
    label: 'owner approves',
    do: (s) => {
      const ap = s.get().pendingApproval
      if (!ap) return
      s.patch({
        pendingApproval: { ...ap, status: 'approved', remember: true },
      })
      toast(s, 'Approved · "remember this" → trust grant created', 'success')
      setTimeout(() => {
        s.patch({ pendingApproval: null })
        const running = s.get().toolCalls.find((t) => t.tool === 'send_email' && t.status === 'running')
        if (running) toolDone(s, running.id)
        s.addOutput({
          id: 'out-1',
          kind: 'email_draft',
          title: 'Invoice #INV-2041 — James Reeves',
          to: 'jreeves@gmail.com',
          preview: 'Invoice for $1,840.00 — water heater install. Due in 30 days.',
          createdAt: '6:00 PM',
          status: 'sent',
        })
      }, 1500)
    },
  },

  /* ----- second invoice, auto-approved by the new trust grant ----- */
  {
    t: 47500,
    label: 'next job',
    patch: { liveScene: { kind: 'jobboard_job_detail', jobId: 'J-4181' } },
    do: (s) => {
      s.addRunStep({ id: nid('rs'), text: 'J-4181 — Chen, AC tune-up — $245 unpaid', ts: Date.now() })
      const id = toolStart(
        s,
        'composio_call',
        'composio_call(quickbooks.create_invoice, customer=Chen, amount=$245)',
      )
      setTimeout(() => toolDone(s, id), 900)
    },
  },
  {
    t: 49000,
    label: 'send (auto-approved)',
    do: (s) => {
      const id = toolStart(
        s,
        'send_email',
        'send_email(to=schen@gmail.com, subject="Invoice #INV-2042 …")',
        'auto-approved by trust grant',
      )
      setTimeout(() => {
        toolDone(s, id)
        s.addOutput({
          id: 'out-2',
          kind: 'email_draft',
          title: 'Invoice #INV-2042 — Sarah Chen',
          to: 'schen@gmail.com',
          preview: 'Invoice for $245.00 — AC tune-up. Due in 30 days.',
          createdAt: '6:00 PM',
          status: 'sent',
        })
      }, 1100)
    },
  },

  /* ----- review-request SMS batch ----- */
  {
    t: 51000,
    chapter: 'Review-request SMS',
    label: 'SMS drafts',
    patch: {
      liveScene: {
        kind: 'sms_compose',
        to: '+1 (412) 555-0119 · James Reeves',
        body:
          "Hey James, it's Mike at Acme — hope the new water heater is treating you right! If you've got 30 seconds, would you mind dropping us a quick Google review? Big help to a small shop. ★★★★★ — https://g.co/r/acmehomes",
        typed: 0,
      },
    },
  },
  ...typewriteSms(51000, 54500),
  {
    t: 54700,
    do: (s) => {
      const id = toolStart(s, 'send_sms', 'send_sms(to=+1 412-555-0119 · review request)')
      setTimeout(() => {
        toolDone(s, id)
        s.addOutput({
          id: 'out-3',
          kind: 'sms_draft',
          title: 'Review request — James Reeves',
          to: '+1 (412) 555-0119',
          preview: '"Hey James, it\'s Mike at Acme — hope the new water heater is treating you right…"',
          createdAt: '6:00 PM',
          status: 'sent',
        })
        s.addOutput({
          id: 'out-4',
          kind: 'sms_draft',
          title: 'Review request — Sarah Chen',
          to: '+1 (412) 555-0144',
          preview: '"Hey Sarah, it\'s Mike at Acme — thanks for trusting us with the AC tune-up today…"',
          createdAt: '6:00 PM',
          status: 'sent',
        })
        s.addOutput({
          id: 'out-5',
          kind: 'sms_draft',
          title: 'Review request — Marcus Diaz',
          to: '+1 (412) 555-0167',
          preview: '"Hey Marcus, Mike here from Acme — appreciate you choosing us for the panel upgrade…"',
          createdAt: '6:00 PM',
          status: 'sent',
        })
      }, 1300)
    },
  },

  /* ----- self-learning moment: agent writes a new skill ----- */
  {
    t: 57000,
    chapter: 'Self-learning',
    label: 'skill_write',
    do: (s) => {
      const id = toolStart(
        s,
        'skill_write',
        'skill_write(host=app.jobboardpro.com, name="end-of-day batch flow")',
        'saving this end-to-end batch so the next run is faster + cheaper',
      )
      setTimeout(() => {
        toolDone(s, id)
        s.patch({
          skills: [
            {
              id: 'sk-fresh',
              name: 'end-of-day batch flow',
              description: 'Full ordering for end-of-day: extract completed jobs → invoice unpaid → SMS reviews',
              host: 'app.jobboardpro.com',
              body: '# End-of-day batch flow\n\nLearned 2026-05-27 during run-001.\n\n1. JobBoard Pro `/today` filter to `status=completed`\n2. For each row, check `balance-due` cell ...',
              confidence: 0.95,
              createdAt: 'just now',
              fresh: true,
            },
            ...s.get().skills,
          ],
        })
        toast(s, 'New skill saved — next run will be ~40% faster', 'success')
      }, 1400)
    },
  },

  /* ----- run completes ----- */
  {
    t: 60000,
    label: 'final_answer',
    do: (s) => {
      const id = toolStart(s, 'final_answer', 'final_answer(summary)')
      setTimeout(() => {
        toolDone(s, id)
        const r = s.get().activeRun
        if (r) {
          s.patch({
            activeRun: { ...r, status: 'completed', durationSec: 47, jobsProcessed: 3, outputsCount: 5, costCents: 14 },
            runs: [
              {
                ...r,
                status: 'completed',
                durationSec: 47,
                jobsProcessed: 3,
                outputsCount: 5,
                costCents: 14,
              },
              ...s.get().runs,
            ],
            automations: s.get().automations.map((a) =>
              a.id === 'auto-001' ? { ...a, runCount: 1, lastRunAt: 'just now', nextRunAt: 'tomorrow 6:00 PM' } : a,
            ),
            storyTitle: 'Run done in 47 seconds.',
            storySubtitle: '$14 of compute. 5 outputs. Zero things sent without your approval.',
          })
        }
      }, 900)
    },
  },

  /* show the outputs panel filling in */
  {
    t: 61500,
    label: 'review outputs',
    patch: { view: 'outputs' },
  },

  /* ============================================================
     ACT 4 — Story 2: new lead intake + quote
     ============================================================ */
  {
    t: 67000,
    chapter: 'A new lead just landed',
    label: 'lead webhook',
    patch: {
      view: 'authoring',
      storyTitle: 'Different trigger. Same pattern.',
      storySubtitle: 'A lead form submission fires the second automation you built.',
      authoringStatus: 'idle',
    },
    do: (s) => {
      s.appendChat({ id: 'u-2', role: 'user', text: USER_REQUEST_2, streamedChars: 0 })
    },
  },
  ...streamCharsBeats('u-2', USER_REQUEST_2, 67200, 71500),

  {
    t: 71800,
    do: (s) => {
      const id = toolStart(s, 'propose_automation', 'propose_automation(name="lead intake → quote SMS")')
      setTimeout(() => {
        toolDone(s, id)
        s.patch({
          automations: [
            ...s.get().automations,
            {
              id: 'auto-002',
              name: 'Lead intake → personalized quote SMS',
              description: 'Website form → research address → comparable jobs → draft quote SMS',
              trigger: 'webhook · website lead form',
              status: 'active',
              nextRunAt: 'on next lead',
              runCount: 0,
            },
          ],
        })
        s.appendChat({ id: 'a-4', role: 'agent', text: AGENT_PROPOSAL_2, streamedChars: 0 })
      }, 1300)
    },
  },
  ...streamCharsBeats('a-4', AGENT_PROPOSAL_2, 73500, 75500),

  /* webhook fires immediately for demo purposes */
  {
    t: 77000,
    chapter: 'New lead submitted',
    label: 'webhook fires',
    do: (s) => {
      toast(s, 'New lead from acmehomes.com/quote → automation firing', 'info')
    },
  },
  {
    t: 77800,
    patch: {
      view: 'run',
      activeRun: {
        id: 'run-002',
        automationId: 'auto-002',
        automationName: 'Lead intake → personalized quote SMS',
        status: 'running',
        trigger: 'webhook',
        startedAt: 'just now',
      },
      toolCalls: [],
      runSteps: [],
      liveScene: {
        kind: 'lead_form_inbound',
        name: 'Sarah Maddox',
        phone: '(412) 555-0117',
        address: '218 Maple St, Pittsburgh PA',
        problem: 'AC stopped cooling. House is 92°F upstairs. Two kids, urgent if possible today.',
      },
    },
    do: (s) => {
      s.addRunStep({ id: nid('rs'), text: 'Webhook payload received from acmehomes.com', ts: Date.now() })
    },
  },

  /* research the address */
  {
    t: 79500,
    label: 'google maps lookup',
    patch: { liveScene: { kind: 'google_maps', address: '218 Maple St, Pittsburgh PA' } },
    do: (s) => {
      const id = toolStart(
        s,
        'goto_url',
        'goto_url("maps.google.com/?q=218+Maple+St+Pittsburgh+PA")',
        'getting the neighborhood + house size',
      )
      setTimeout(() => toolDone(s, id), 1100)
    },
  },
  {
    t: 81200,
    label: 'extract neighborhood',
    do: (s) => {
      const id = toolStart(
        s,
        'extract',
        'extract({house_size, neighborhood, year_built})',
        '1,940 sqft · Squirrel Hill · 1953 · likely original ductwork',
      )
      setTimeout(() => toolDone(s, id), 900)
    },
  },
  {
    t: 82800,
    label: 'comparable jobs',
    do: (s) => {
      const id = toolStart(
        s,
        'helper_call',
        'find_comparable_jobs(neighborhood="Squirrel Hill", problem="AC stopped cooling")',
        '3 jobs in the last 90 days. Avg ticket $385. 2 same-day fixes (capacitor).',
      )
      setTimeout(() => toolDone(s, id), 1100)
    },
  },

  /* draft personalized SMS */
  {
    t: 84500,
    chapter: 'Personalized quote',
    label: 'draft quote SMS',
    patch: {
      liveScene: {
        kind: 'sms_compose',
        to: '+1 (412) 555-0117 · Sarah Maddox',
        body:
          "Hi Sarah — Mike at Acme Home Services. Just saw your form come in. With the kids and 92° upstairs, I get the urgency. Most AC-stopped-cooling calls we run in Squirrel Hill turn out to be a capacitor — same-day fix, usually $325–$425 all-in. I can have a tech at 218 Maple by 4:30 today if that works. Reply YES and I'll lock it.",
        typed: 0,
      },
    },
  },
  ...typewriteSms(84500, 89800),

  {
    t: 90000,
    label: 'approval ping',
    do: (s) => {
      s.patch({
        pendingApproval: {
          id: 'ap-2',
          toolName: 'send_sms',
          title: 'Send quote SMS to Sarah Maddox?',
          preview:
            'To: (412) 555-0117\n\nHi Sarah — Mike at Acme Home Services. Just saw your form come in. With the kids and 92° upstairs, I get the urgency. Most AC-stopped-cooling calls we run in Squirrel Hill turn out to be a capacitor — same-day fix, usually $325–$425 all-in. I can have a tech at 218 Maple by 4:30 today if that works. Reply YES and I\'ll lock it.',
          riskLine: 'This text goes to a real customer phone number.',
          requestedAt: Date.now(),
          status: 'pending',
        },
      })
      toast(s, 'New lead · approval requested', 'warn')
    },
  },
  {
    t: 93000,
    label: 'owner approves',
    do: (s) => {
      const ap = s.get().pendingApproval
      if (!ap) return
      s.patch({ pendingApproval: { ...ap, status: 'approved' } })
      toast(s, 'Sent. Lead-to-quote in 14 seconds.', 'success')
      setTimeout(() => {
        s.patch({ pendingApproval: null })
        const running = s.get().toolCalls.find((t) => t.tool === 'send_sms' && t.status === 'running')
        if (running) toolDone(s, running.id)
        s.addOutput({
          id: 'out-6',
          kind: 'sms_draft',
          title: 'Quote SMS — Sarah Maddox (NEW LEAD)',
          to: '+1 (412) 555-0117',
          preview: '"Hi Sarah — Mike at Acme Home Services. Just saw your form come in…"',
          createdAt: 'just now',
          status: 'sent',
        })
      }, 1200)
    },
  },

  {
    t: 95000,
    label: 'lead run done',
    do: (s) => {
      const r = s.get().activeRun
      if (r) {
        s.patch({
          activeRun: { ...r, status: 'completed', durationSec: 14, jobsProcessed: 1, outputsCount: 1, costCents: 6 },
          runs: [
            { ...r, status: 'completed', durationSec: 14, jobsProcessed: 1, outputsCount: 1, costCents: 6 },
            ...s.get().runs,
          ],
          automations: s.get().automations.map((a) =>
            a.id === 'auto-002' ? { ...a, runCount: 1, lastRunAt: 'just now' } : a,
          ),
        })
      }
    },
  },

  /* ============================================================
     ACT 5 — Wrap
     ============================================================ */
  {
    t: 97000,
    chapter: 'That\'s Basics.',
    label: 'wrap',
    patch: {
      view: 'automations',
      storyTitle: 'You demonstrated it once. Basics runs it forever.',
      storySubtitle: '2 automations · 6 outputs · 1 minute of compute. Zero things sent without you.',
    },
  },
  {
    t: 99000,
    patch: { view: 'outputs' },
  },
  {
    t: 102000,
    patch: { view: 'skills' },
    do: (s) => {
      toast(s, 'Every run makes the next one cheaper + faster', 'info')
    },
  },
  {
    t: 105000,
    patch: {
      view: 'automations',
      storyTitle: 'Ready to try it in your shop?',
      storySubtitle: 'trybasics.ai',
    },
  },
]

/* ------------------------------------------------------------------------ */
/* typewriter helpers — turn a static target text into a per-char beat list */
/* ------------------------------------------------------------------------ */

function streamCharsBeats(messageId: string, text: string, fromMs: number, toMs: number): Beat[] {
  const totalChars = text.length
  const steps = Math.max(8, Math.floor(totalChars / 3))
  const out: Beat[] = []
  for (let i = 1; i <= steps; i++) {
    const chars = Math.round((i / steps) * totalChars)
    const t = fromMs + ((toMs - fromMs) * i) / steps
    out.push({
      t,
      do: (s) => s.growChat(messageId, chars),
    })
  }
  return out
}

function typewriteGmail(fromMs: number, toMs: number): Beat[] {
  const out: Beat[] = []
  for (let i = 1; i <= 30; i++) {
    out.push({
      t: fromMs + ((toMs - fromMs) * i) / 30,
      do: (s) => {
        const ls = s.get().liveScene
        if (ls.kind !== 'gmail_compose') return
        s.patch({ liveScene: { ...ls, typed: Math.round((i / 30) * ls.body.length) } })
      },
    })
  }
  return out
}

function typewriteSms(fromMs: number, toMs: number): Beat[] {
  const out: Beat[] = []
  for (let i = 1; i <= 24; i++) {
    out.push({
      t: fromMs + ((toMs - fromMs) * i) / 24,
      do: (s) => {
        const ls = s.get().liveScene
        if (ls.kind !== 'sms_compose') return
        s.patch({ liveScene: { ...ls, typed: Math.round((i / 24) * ls.body.length) } })
      },
    })
  }
  return out
}

export const TOTAL_DURATION_MS = 108000
