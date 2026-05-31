import { createHash } from 'node:crypto'

import { supabaseAdmin } from './supabase.js'
import { logger } from '../middleware/logger.js'

/**
 * Automation-suggestion GENERATORS — the write-heavy "I noticed you do X" pass.
 *
 * Ported from the old web lib (web/src/lib/suggestions-data.ts, pre-migration)
 * but scoped to an explicit workspaceId from the caller's workspace JWT instead
 * of a hardcoded PRIMARY_WORKSPACE_ID + service-role-on-the-client. These run
 * server-side under cloud/api's own admin client (same trust boundary as
 * lens-distill.ts) and only ever touch the one workspace passed in.
 *
 * Two model-free signals feed the same `automation_suggestions` table:
 *   • 'runs' — recurring ad-hoc runs in history (token-Jaccard clustering).
 *   • 'lens' — `lens_observations` (tier-1 distilled intents) clustered over a
 *     long horizon and promoted once an intent RECURS across distinct occasions.
 *
 * Dismissals stick: we upsert with ignoreDuplicates on (workspace_id,dedup_key),
 * so a dismissed row is never resurrected by re-running the heuristic.
 */

// Agent/browser boilerplate + stopwords stripped before clustering, so the SAME
// intent phrased differently collapses into one cluster.
const STOP = new Set([
  'the', 'use', 'browser', 'then', 'stop', 'open', 'go', 'to', 'and', 'tell', 'me', 'at',
  'my', 'a', 'an', 'of', 'in', 'on', 'is', 'it', 'that', 'this', 'page', 'take', 'your',
  'time', 'please', 'exact', 'raw', 'body', 'shown', 'with', 'for', 'from', 'into', 'out',
  'you', 'are', 'was', 'will', 'can', 'via', 'using', 'about', 'their', 'them', 'one',
  'each', 'right', 'now', 'short', 'detail', 'detailed', 'start', 'new', 'get', 'got',
])

// Crude stemmer so paraphrases collapse ("summarize"/"summary" → "summ").
function stem(w: string): string {
  if (w.length <= 4) return w
  return w
    .replace(/(ization|isation|izing|ising|ize|ise|aries|ary|ies|ing|ed|es|s)$/, '')
    .replace(/(.)\1$/, '$1')
}

function tokenize(goal: string): Set<string> {
  const domains = [...goal.matchAll(/https?:\/\/([^/\s]+)/gi)].map((m) =>
    (m[1] ?? '').toLowerCase().replace(/^www\./, ''),
  )
  const words = goal
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length > 2)
  return new Set([...domains, ...words])
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter += 1
  return inter / (a.size + b.size - inter)
}

function goalText(snapshot: unknown): string {
  if (typeof snapshot === 'string') return snapshot
  if (snapshot && typeof snapshot === 'object') {
    const o = snapshot as Record<string, unknown>
    for (const k of ['goal', 'prompt', 'instruction', 'task', 'objective']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim()) return o[k] as string
    }
  }
  return ''
}

function cleanTitle(goal: string): string {
  let t = goal
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/^use the browser to:?\s*/i, '')
    .replace(/^(go to|open|navigate to)\s+/i, '')
    .replace(/,?\s*then stop\.?$/i, '')
    .trim()
  if (t.length > 72) t = `${t.slice(0, 69).trimEnd()}…`
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const MIN_OCCURRENCES = 3 // high-precision: only suggest clearly recurring tasks
const MAX_SUGGESTIONS = 3
const SIMILARITY = 0.4 // token Jaccard; loose enough to merge paraphrases of one intent
const LOOKBACK_DAYS = 7

interface RunLite {
  goal: string
  tokens: Set<string>
  createdAt: string
}
interface Cluster {
  rep: RunLite
  members: RunLite[]
  tokenFreq: Map<string, number>
}

/**
 * Cluster recent ad-hoc runs by intent similarity and upsert a suggestion for
 * each cluster that recurs >= MIN_OCCURRENCES and isn't already covered by an
 * existing automation. Model-free. Returns # rows upserted.
 */
export async function generateRunHistorySuggestions(workspaceId: string): Promise<number> {
  const supabase = supabaseAdmin()
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: runRows } = await supabase
    .from('cloud_runs')
    .select('prompt_snapshot,created_at,status')
    .eq('workspace_id', workspaceId)
    .is('automation_id', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200)

  const runs: RunLite[] = []
  for (const r of (runRows ?? []) as Array<{ prompt_snapshot: unknown; created_at: string; status: string | null }>) {
    if ((r.status ?? '').toLowerCase() === 'failed') continue // don't suggest tasks that don't work
    const goal = goalText(r.prompt_snapshot).trim()
    if (goal.length < 12 || goal.length > 600) continue
    if (/automation-authoring agent|propose_automation|activate_automation|rehydrated after worker|self_hosted_adapter|composio_list_triggers/i.test(goal)) continue
    const tokens = tokenize(goal)
    if (tokens.size < 2) continue
    runs.push({ goal, tokens, createdAt: r.created_at })
  }
  if (runs.length < MIN_OCCURRENCES) return 0

  // Greedy single-link clustering on token Jaccard.
  const clusters: Cluster[] = []
  for (const run of runs) {
    let best: Cluster | null = null
    let bestSim = SIMILARITY
    for (const c of clusters) {
      const sim = jaccard(run.tokens, c.rep.tokens)
      if (sim >= bestSim) {
        best = c
        bestSim = sim
      }
    }
    if (best) {
      best.members.push(run)
      for (const tk of run.tokens) best.tokenFreq.set(tk, (best.tokenFreq.get(tk) ?? 0) + 1)
    } else {
      const tokenFreq = new Map<string, number>()
      for (const tk of run.tokens) tokenFreq.set(tk, 1)
      clusters.push({ rep: run, members: [run], tokenFreq })
    }
  }

  // Existing automation goals — skip clusters already covered.
  const { data: autoRows } = await supabase
    .from('automations')
    .select('goal,name')
    .eq('workspace_id', workspaceId)
    .limit(100)
  const autoTokens = ((autoRows ?? []) as Array<{ goal: string | null; name: string | null }>).map((a) =>
    tokenize(`${a.goal ?? ''} ${a.name ?? ''}`),
  )

  const candidates = clusters
    .filter((c) => c.members.length >= MIN_OCCURRENCES)
    .filter((c) => !autoTokens.some((at) => jaccard(c.rep.tokens, at) >= 0.6))
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, MAX_SUGGESTIONS)
  if (candidates.length === 0) return 0

  const rows = candidates.map((c) => {
    const count = c.members.length
    const sigTokens = [...c.tokenFreq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map((e) => e[0])
      .sort()
    const dedupKey = `runs:${createHash('sha1').update(sigTokens.join('-')).digest('hex').slice(0, 16)}`
    const rep = c.rep.goal.replace(/^["']+|["']+$/g, '')
    return {
      workspace_id: workspaceId,
      source: 'runs',
      title: cleanTitle(c.rep.goal),
      rationale: `You've run this ${count} times recently. Turn it into a one-click (or scheduled) automation.`,
      suggested_prompt: `Create a reusable automation for a task I do often. A representative example of what I ask:\n\n"${rep}"\n\nBuild it as an automation I can re-run, offer to put it on a schedule if that fits, then run it once to confirm it works.`,
      evidence: { runCount: count, lastRunAt: c.rep.createdAt, signature: sigTokens },
      confidence: Math.min(0.95, 0.5 + 0.08 * count),
      dedup_key: dedupKey,
      status: 'pending',
    }
  })

  const { error } = await supabase
    .from('automation_suggestions')
    .upsert(rows, { onConflict: 'workspace_id,dedup_key', ignoreDuplicates: true })
  return error ? 0 : rows.length
}

// ---------------------------------------------------------------------------
// Lens recurrence pass (tier 2 of the 'lens' signal). The distill endpoint
// records one `lens_observations` row per ~15-min window that contained a task
// (a normalized intent label + a runnable prompt). Here we cluster those labels
// over a long horizon and promote an intent once it RECURS across distinct
// occasions — which a single window could never tell us.
// ---------------------------------------------------------------------------

interface ObsRow {
  intent: string
  title: string | null
  suggested_prompt: string | null
  apps: unknown
  occurred_at: string
}

export async function generateLensSuggestions(workspaceId: string): Promise<number> {
  const supabase = supabaseAdmin()
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data: obsRows } = await supabase
    .from('lens_observations')
    .select('intent,title,suggested_prompt,apps,occurred_at')
    .eq('workspace_id', workspaceId)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(600)

  const obs = ((obsRows ?? []) as ObsRow[])
    .map((o) => ({ ...o, tokens: tokenize(o.intent || o.title || '') }))
    .filter((o) => o.tokens.size >= 2)
  if (obs.length < MIN_OCCURRENCES) return 0

  interface ObsCluster {
    rep: (typeof obs)[number]
    members: (typeof obs)[number][]
    tokenFreq: Map<string, number>
  }
  const clusters: ObsCluster[] = []
  for (const o of obs) {
    let best: ObsCluster | null = null
    let bestSim = SIMILARITY
    for (const c of clusters) {
      const sim = jaccard(o.tokens, c.rep.tokens)
      if (sim >= bestSim) {
        best = c
        bestSim = sim
      }
    }
    if (best) {
      best.members.push(o)
      for (const tk of o.tokens) best.tokenFreq.set(tk, (best.tokenFreq.get(tk) ?? 0) + 1)
    } else {
      const tokenFreq = new Map<string, number>()
      for (const tk of o.tokens) tokenFreq.set(tk, 1)
      clusters.push({ rep: o, members: [o], tokenFreq })
    }
  }

  const { data: autoRows } = await supabase
    .from('automations')
    .select('goal,name')
    .eq('workspace_id', workspaceId)
    .limit(100)
  const autoTokens = ((autoRows ?? []) as Array<{ goal: string | null; name: string | null }>).map((a) =>
    tokenize(`${a.goal ?? ''} ${a.name ?? ''}`),
  )

  const HOUR = 60 * 60 * 1000
  const candidates = clusters
    .filter((c) => c.members.length >= MIN_OCCURRENCES)
    // Genuine recurrence, not one long contiguous task: span >2h or >=2 days.
    .filter((c) => {
      const times = c.members.map((m) => new Date(m.occurred_at).getTime())
      const span = Math.max(...times) - Math.min(...times)
      const days = new Set(c.members.map((m) => m.occurred_at.slice(0, 10))).size
      return span > 2 * HOUR || days >= 2
    })
    .filter((c) => !autoTokens.some((at) => jaccard(c.rep.tokens, at) >= 0.6))
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, MAX_SUGGESTIONS)
  if (candidates.length === 0) return 0

  const rows = candidates.map((c) => {
    const count = c.members.length
    const sigTokens = [...c.tokenFreq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map((e) => e[0])
      .sort()
    const dedupKey = `lens:${createHash('sha1').update(sigTokens.join('-')).digest('hex').slice(0, 16)}`
    const repApps = Array.isArray(c.rep.apps) ? (c.rep.apps as string[]) : []
    const title = (c.rep.title?.trim() || cleanTitle(c.rep.intent)).slice(0, 120)
    const prompt =
      c.rep.suggested_prompt?.trim() ||
      `Create a reusable automation for: ${c.rep.intent}. Build it so I can re-run it, and offer to put it on a schedule if that fits.`
    return {
      workspace_id: workspaceId,
      source: 'lens',
      title,
      rationale: `I noticed you do this ${count} times across your recent activity${repApps.length ? ` (in ${repApps.slice(0, 3).join(', ')})` : ''}. Want to automate it?`,
      suggested_prompt: prompt,
      evidence: { observationCount: count, lastSeenAt: c.rep.occurred_at, signature: sigTokens, apps: repApps.slice(0, 6) },
      confidence: Math.min(0.95, 0.5 + 0.08 * count),
      dedup_key: dedupKey,
      status: 'pending',
    }
  })

  const { error } = await supabase
    .from('automation_suggestions')
    .upsert(rows, { onConflict: 'workspace_id,dedup_key', ignoreDuplicates: true })
  return error ? 0 : rows.length
}

// Throttle so reads don't re-cluster on every request. Per-task in-memory is
// fine: generation is idempotent (upsert ignoreDuplicates), so the worst case
// across Fargate tasks is a few redundant (harmless) passes per window.
const lastRefresh = new Map<string, number>()
const REFRESH_TTL_MS = 5 * 60 * 1000

/** Best-effort, throttled refresh of both signals for one workspace. */
export async function refreshSuggestionsIfStale(workspaceId: string): Promise<void> {
  const now = Date.now()
  if (now - (lastRefresh.get(workspaceId) ?? 0) < REFRESH_TTL_MS) return
  lastRefresh.set(workspaceId, now) // set first so concurrent reads don't pile up
  try {
    await Promise.all([
      generateRunHistorySuggestions(workspaceId),
      generateLensSuggestions(workspaceId),
    ])
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'suggestion refresh failed')
  }
}
