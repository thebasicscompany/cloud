import { NextResponse } from "next/server";

import {
  generateLensSuggestions,
  generateRunHistorySuggestions,
  getPendingSuggestions,
} from "@/lib/suggestions-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pending automation suggestions for the workspace. Refreshes both recurrence
 * signals on read (cheap, model-free, just clustering): run history and lens
 * observations (the per-window intents the distill endpoint recorded). An intent
 * that recurs across enough distinct occasions becomes a suggestion.
 */
export async function GET() {
  await Promise.allSettled([generateRunHistorySuggestions(), generateLensSuggestions()]);
  const suggestions = await getPendingSuggestions();
  return NextResponse.json({ suggestions });
}
