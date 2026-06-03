// CLOUD-AGENT-PLAN §8.3 + BUILD-LOOP D.3 — skill loader middleware.
// Before the agent issues a host-touching tool call (goto_url, js, http_get,
// new_tab navigating to a URL), this loader queries the `skills` table for
// rows matching workspace_id + host that are active + already approved
// (pending_review = false), composes a system-prompt fragment listing the
// catalog + bodies of the top-N most-confident, and the integration code
// (opencode session middleware) injects it into the next model call.

import postgres from "postgres";

export interface LoadedSkill {
  id: string;
  name: string;
  description: string;
  body: string;
  confidence: number;
}

export interface SkillLoader {
  loadForHost(input: { workspaceId: string; host: string; limit?: number }): Promise<LoadedSkill[]>;
  /** G.4 — load every active skill for the workspace (host-agnostic). */
  loadAll(input: { workspaceId: string; limit?: number }): Promise<LoadedSkill[]>;
  /**
   * Goal-aware retrieval: fetch a wider candidate pool by confidence, then
   * re-rank by token-overlap with the run's goal text — so the agent sees the
   * top-K skills most RELEVANT to this run rather than the top-K most
   * trusted in the workspace (which is often noise on a novel task).
   */
  loadRelevant?(input: { workspaceId: string; goalText: string; limit?: number }): Promise<LoadedSkill[]>;
}

/** Hostname normalizer — strips port, downcases, drops trailing dot. */
export function normalizeHost(input: string): string {
  if (!input) return "";
  let h = input.trim().toLowerCase();
  // Allow callers to pass full URLs.
  if (h.startsWith("http://") || h.startsWith("https://")) {
    try {
      h = new URL(h).hostname;
    } catch {
      // fall through with the raw string
    }
  }
  // Strip port + trailing dot.
  h = h.split(":")[0]!.replace(/\.$/, "");
  return h;
}

const DEFAULT_LIMIT = 5;

/** Production loader — reads from public.cloud_skills via Supavisor pooler. */
export class PgSkillLoader implements SkillLoader {
  private sql: ReturnType<typeof postgres>;
  constructor(opts: { databaseUrl: string }) {
    this.sql = postgres(opts.databaseUrl, { max: 1, prepare: false, idle_timeout: 5 });
  }

  async loadForHost(input: { workspaceId: string; host: string; limit?: number }): Promise<LoadedSkill[]> {
    const host = normalizeHost(input.host);
    if (!host) return [];
    const limit = input.limit ?? DEFAULT_LIMIT;
    const rows = await this.sql<
      Array<{ id: string; name: string; description: string; body: string; confidence: string }>
    >`
      SELECT id, name, description, body, confidence
        FROM public.cloud_skills
       WHERE workspace_id  = ${input.workspaceId}
         AND host          = ${host}
         AND active        = true
         AND pending_review = false
         AND superseded_by IS NULL
       ORDER BY confidence DESC, last_edited_at DESC NULLS LAST, created_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      body: r.body,
      confidence: Number(r.confidence),
    }));
  }

  async loadAll(input: { workspaceId: string; limit?: number }): Promise<LoadedSkill[]> {
    const limit = input.limit ?? 20;
    const rows = await this.sql<
      Array<{ id: string; name: string; description: string; body: string; confidence: string; host: string | null }>
    >`
      SELECT id, name, description, body, confidence, host
        FROM public.cloud_skills
       WHERE workspace_id   = ${input.workspaceId}
         AND active         = true
         AND pending_review = false
         AND superseded_by IS NULL
       ORDER BY confidence DESC, last_edited_at DESC NULLS LAST, created_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      body: r.body,
      confidence: Number(r.confidence),
    }));
  }

  /**
   * Pulls a wider candidate pool (top-N by confidence) and re-ranks by
   * token-overlap with the goal text. Final score is
   *   0.6 × overlap + 0.4 × confidence
   * so a strong topical match beats workspace-wide bias, but high-confidence
   * skills still surface when the goal doesn't lexically match anything.
   *
   * No embeddings — pure in-memory token math (Jaccard over Set<word>),
   * cheap, no schema change, no extra API call. A pgvector-backed version
   * is the next step once we have a /v1/embeddings client in the worker.
   */
  async loadRelevant(input: { workspaceId: string; goalText: string; limit?: number }): Promise<LoadedSkill[]> {
    const goalTokens = tokenize(input.goalText);
    if (goalTokens.size === 0) {
      // No usable goal text — fall back to confidence-only top-K so the agent
      // still gets some signal instead of nothing.
      return this.loadAll({ workspaceId: input.workspaceId, limit: input.limit ?? DEFAULT_LIMIT });
    }
    const limit = input.limit ?? DEFAULT_LIMIT;
    const CANDIDATE_POOL = 30;
    const rows = await this.sql<
      Array<{ id: string; name: string; description: string; body: string; confidence: string; host: string | null }>
    >`
      SELECT id, name, description, body, confidence, host
        FROM public.cloud_skills
       WHERE workspace_id   = ${input.workspaceId}
         AND active         = true
         AND pending_review = false
         AND superseded_by IS NULL
       ORDER BY confidence DESC, last_edited_at DESC NULLS LAST, created_at DESC
       LIMIT ${CANDIDATE_POOL}
    `;
    const scored = rows.map((r) => {
      const text = `${r.name} ${r.description} ${r.host ?? ""}`;
      const overlap = jaccard(goalTokens, tokenize(text));
      const confidence = Number(r.confidence);
      return {
        skill: {
          id: r.id,
          name: r.name,
          description: r.description,
          body: r.body,
          confidence,
        } satisfies LoadedSkill,
        score: 0.6 * overlap + 0.4 * confidence,
      };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.skill);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

// ─── Token-overlap utilities (in-memory re-ranker) ─────────────────────────

const STOPWORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","has","have","he","her",
  "his","i","in","is","it","its","me","my","of","on","or","s","she","that","the",
  "their","them","they","this","to","was","we","were","what","when","where","which",
  "who","will","with","you","your",
  // Domain noise from goal preambles ("post-run memory mandate", "objective for
  // this run") — these appear in EVERY goal, so they'd inflate overlap scores
  // uniformly and break ranking.
  "run","agent","objective","instructions","task","tool","tools",
]);

function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Tests + dry-runs. */
export class InMemorySkillLoader implements SkillLoader {
  private rows: Array<{
    id: string;
    workspaceId: string;
    host: string;
    name: string;
    description: string;
    body: string;
    confidence: number;
    active: boolean;
    pendingReview: boolean;
    supersededBy: string | null;
  }> = [];

  add(row: {
    id: string;
    workspaceId: string;
    host: string;
    name: string;
    description: string;
    body: string;
    confidence?: number;
    active?: boolean;
    pendingReview?: boolean;
    supersededBy?: string | null;
  }): void {
    this.rows.push({
      confidence: row.confidence ?? 0.5,
      active: row.active ?? true,
      pendingReview: row.pendingReview ?? false,
      supersededBy: row.supersededBy ?? null,
      ...row,
    });
  }

  async loadForHost(input: { workspaceId: string; host: string; limit?: number }): Promise<LoadedSkill[]> {
    const host = normalizeHost(input.host);
    const limit = input.limit ?? DEFAULT_LIMIT;
    return this.rows
      .filter(
        (r) =>
          r.workspaceId === input.workspaceId &&
          r.host === host &&
          r.active &&
          !r.pendingReview &&
          r.supersededBy === null,
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        body: r.body,
        confidence: r.confidence,
      }));
  }

  async loadAll(input: { workspaceId: string; limit?: number }): Promise<LoadedSkill[]> {
    const limit = input.limit ?? 20;
    return this.rows
      .filter(
        (r) =>
          r.workspaceId === input.workspaceId &&
          r.active &&
          !r.pendingReview &&
          r.supersededBy === null,
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        body: r.body,
        confidence: r.confidence,
      }));
  }
}

/**
 * Compose the system-prompt fragment opencode sees on the next turn.
 * Layered per CLOUD-AGENT-PLAN §8.3:
 *   - Layer 3: catalog (one-line per matching skill)
 *   - Layer 4: full bodies of the top-N by confidence (caller chose limit)
 */
export function composeSkillContext(host: string, skills: ReadonlyArray<LoadedSkill>): string {
  if (skills.length === 0) {
    return `<skills host="${host}" count="0">no skills indexed for ${host}</skills>`;
  }
  const catalog = skills
    .map((s) => `- ${s.name} (confidence ${s.confidence.toFixed(2)}): ${s.description}`)
    .join("\n");
  const bodies = skills
    .map((s) => `<skill name="${s.name}">\n${s.body}\n</skill>`)
    .join("\n\n");
  return [
    `<skills host="${host}" count="${skills.length}">`,
    "",
    "## Catalog",
    catalog,
    "",
    "## Bodies",
    bodies,
    "</skills>",
  ].join("\n");
}
