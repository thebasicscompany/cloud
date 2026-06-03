import "server-only";

import { cloudFetch, cloudGet } from "@/lib/api/cloud";

/**
 * Automation suggestions - the "I noticed you do X, want to automate it?" surface.
 *
 * Reads + the dismiss/accept mutation now go through cloud/api
 * (`/v1/suggestions`), scoped to the caller's workspace by the workspace JWT -
 * no service-role admin client, no hardcoded PRIMARY_WORKSPACE_ID. See
 * `cloud/api/src/routes/suggestions.ts`.
 *
 * The two recurrence-clustering GENERATORS (run history + lens) are write-heavy
 * batch jobs and do NOT belong in the per-user renderer. They are stubbed here
 * and move server-side (a worker / route job runs them under the platform's own
 * workspace context). See the no-ops below.
 */

export type SuggestionSource = "runs" | "lens" | "manual";

export interface Suggestion {
  id: string;
  source: SuggestionSource;
  title: string;
  rationale: string;
  suggestedPrompt: string;
  evidence: Record<string, unknown>;
  confidence: number | null;
  createdAt: string;
}

export async function getPendingSuggestions(): Promise<Suggestion[]> {
  const { suggestions } = await cloudGet<{ suggestions: Suggestion[] }>(
    "/v1/suggestions",
    { suggestions: [] },
  );
  return suggestions;
}

export async function setSuggestionStatus(
  id: string,
  status: "dismissed" | "accepted",
): Promise<boolean> {
  try {
    const res = await cloudFetch(`/v1/suggestions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Suggestion GENERATION (run-history recurrence + lens recurrence clustering).
//
// These are write-heavy batch jobs (cluster recent activity, upsert rows) that
// must NOT run under the per-user renderer model - they need the platform's own
// workspace context and would otherwise re-cluster on every read. Generation
// moves server-side (a worker / route job). The clustering logic lives there,
// not here; these stubs keep the existing call sites working by returning the
// "nothing generated" shape.
// ---------------------------------------------------------------------------

export async function generateRunHistorySuggestions(): Promise<number> {
  // No-op in the renderer: generation moved server-side (worker/route job).
  return 0;
}

export async function generateLensSuggestions(): Promise<number> {
  // No-op in the renderer: generation moved server-side (worker/route job).
  return 0;
}
