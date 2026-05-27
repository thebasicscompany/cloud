import { create } from 'zustand'

/* -----------------------------------------------------------------------------
   Demo state — everything visible on screen is derived from this object.
   The script in script.ts patches slices of it over time.
----------------------------------------------------------------------------- */

export type View = 'authoring' | 'automations' | 'run' | 'skills' | 'approvals' | 'outputs'

export type ToolName =
  | 'composio_list_tools'
  | 'composio_list_triggers'
  | 'composio_call'
  | 'goto_url'
  | 'screenshot'
  | 'click_at_xy'
  | 'type_text'
  | 'extract'
  | 'http_get'
  | 'js'
  | 'send_email'
  | 'send_sms'
  | 'skill_write'
  | 'helper_write'
  | 'helper_call'
  | 'propose_automation'
  | 'activate_automation'
  | 'final_answer'

export interface ToolCall {
  id: string
  tool: ToolName
  /** one-line summary for the timeline */
  label: string
  /** longer reasoning shown next to the entry */
  reasoning?: string
  status: 'pending' | 'running' | 'done' | 'awaiting_approval' | 'denied'
  startedAt: number
  endedAt?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'agent' | 'system'
  text: string
  /** when streaming, text grows char-by-char until streamed = full length */
  streamedChars?: number
  toolCallIds?: string[]
}

export interface Automation {
  id: string
  name: string
  description: string
  trigger: string
  status: 'draft' | 'active'
  lastRunAt?: string
  nextRunAt?: string
  runCount: number
}

export interface Skill {
  id: string
  name: string
  description: string
  host: string
  body: string
  confidence: number
  createdAt: string
  fresh?: boolean
}

export interface BrowserSite {
  host: string
  status: 'active'
  connectedAt: string
}

export interface OutputItem {
  id: string
  kind: 'email_draft' | 'sms_draft' | 'invoice_draft'
  title: string
  to: string
  preview: string
  createdAt: string
  status: 'pending_approval' | 'approved' | 'sent'
}

export interface Approval {
  id: string
  toolName: ToolName
  title: string
  preview: string
  riskLine: string
  requestedAt: number
  status: 'pending' | 'approved' | 'denied'
  remember?: boolean
}

export interface RunStep {
  id: string
  text: string
  ts: number
}

export interface Run {
  id: string
  automationId: string
  automationName: string
  status: 'running' | 'paused' | 'completed' | 'failed'
  trigger: 'schedule' | 'webhook' | 'manual'
  startedAt: string
  durationSec?: number
  jobsProcessed?: number
  outputsCount?: number
  costCents?: number
}

/** Whatever mock SaaS the live-view iframe is showing right now. */
export type LiveScene =
  | { kind: 'blank' }
  | { kind: 'jobboard_dashboard'; highlightJobId?: string }
  | { kind: 'jobboard_job_detail'; jobId: string }
  | { kind: 'quickbooks_invoice'; jobId: string }
  | { kind: 'gmail_compose'; subject: string; to: string; body: string; typed: number }
  | { kind: 'lead_form_inbound'; name: string; phone: string; address: string; problem: string }
  | { kind: 'google_maps'; address: string }
  | { kind: 'sms_compose'; to: string; body: string; typed: number }

export interface CursorPos { x: number; y: number; clicking: boolean }

export interface DemoState {
  /* nav */
  view: View
  workspace: { name: string; trade: string }
  /* timeline */
  sceneIdx: number
  playing: boolean
  speed: 0.5 | 1 | 2
  /* authoring chat */
  chat: ChatMessage[]
  authoringStatus: 'idle' | 'thinking' | 'awaiting_user' | 'done'
  /* lists */
  automations: Automation[]
  skills: Skill[]
  browserSites: BrowserSite[]
  outputs: OutputItem[]
  runs: Run[]
  /* live run */
  activeRun: Run | null
  toolCalls: ToolCall[]
  runSteps: RunStep[]
  liveScene: LiveScene
  cursor: CursorPos
  /* approvals */
  pendingApproval: Approval | null
  /* toast */
  toast: { text: string; kind: 'info' | 'success' | 'warn' } | null
  /* current "story" label shown in the topbar */
  storyTitle: string
  storySubtitle: string
  /* the simulated wall clock — drives the topbar clock + cron triggers */
  clockTime: string

  /* setters / actions */
  patch: (p: Partial<DemoState>) => void
  appendChat: (msg: ChatMessage) => void
  growChat: (id: string, chars: number) => void
  upsertToolCall: (tc: ToolCall) => void
  addOutput: (o: OutputItem) => void
  addRunStep: (s: RunStep) => void
  setToast: (t: DemoState['toast']) => void
  reset: () => void
}

const initial: Omit<DemoState, 'patch' | 'appendChat' | 'growChat' | 'upsertToolCall' | 'addOutput' | 'addRunStep' | 'setToast' | 'reset'> = {
  view: 'automations',
  workspace: { name: 'Acme Home Services', trade: 'HVAC · Plumbing · Electrical' },
  sceneIdx: 0,
  playing: true,
  speed: 1,
  chat: [],
  authoringStatus: 'idle',
  automations: [],
  skills: [
    {
      id: 'sk-001',
      name: 'jobboard-job-status-extraction',
      description: 'How to read job status + balance from JobBoard Pro detail page',
      host: 'app.jobboardpro.com',
      body: '# Reading job status\nThe status badge sits in `.job-header__status` and the outstanding balance is in `.balance-due strong`...',
      confidence: 0.92,
      createdAt: 'last week',
    },
    {
      id: 'sk-002',
      name: 'quickbooks-invoice-draft-flow',
      description: 'Click path for creating a QuickBooks invoice from a JobBoard Pro job',
      host: 'qbo.intuit.com',
      body: '# QuickBooks invoice flow\n1. Click + New → Invoice\n2. Match customer by phone (more reliable than name)\n3. Service line items from JobBoard line-items list...',
      confidence: 0.88,
      createdAt: '3 days ago',
    },
  ],
  browserSites: [
    { host: 'app.jobboardpro.com',  status: 'active', connectedAt: '12 days ago' },
    { host: 'qbo.intuit.com',       status: 'active', connectedAt: '12 days ago' },
    { host: 'mail.google.com',      status: 'active', connectedAt: 'today' },
  ],
  outputs: [],
  runs: [],
  activeRun: null,
  toolCalls: [],
  runSteps: [],
  liveScene: { kind: 'blank' },
  cursor: { x: 50, y: 50, clicking: false },
  pendingApproval: null,
  toast: null,
  storyTitle: 'Basics for the trades',
  storySubtitle: 'Demonstrate it once. We run it forever.',
  clockTime: '5:58 PM',
}

export const useDemo = create<DemoState>((set) => ({
  ...initial,
  patch: (p) => set((s) => ({ ...s, ...p })),
  appendChat: (msg) => set((s) => ({ chat: [...s.chat, msg] })),
  growChat: (id, chars) =>
    set((s) => ({
      chat: s.chat.map((m) => (m.id === id ? { ...m, streamedChars: chars } : m)),
    })),
  upsertToolCall: (tc) =>
    set((s) => {
      const existing = s.toolCalls.findIndex((t) => t.id === tc.id)
      if (existing === -1) return { toolCalls: [...s.toolCalls, tc] }
      const next = s.toolCalls.slice()
      next[existing] = { ...next[existing], ...tc }
      return { toolCalls: next }
    }),
  addOutput: (o) => set((s) => ({ outputs: [...s.outputs, o] })),
  addRunStep: (st) => set((s) => ({ runSteps: [...s.runSteps, st] })),
  setToast: (t) => set({ toast: t }),
  reset: () => set({ ...initial }),
}))
