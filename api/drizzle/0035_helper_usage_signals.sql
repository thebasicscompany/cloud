-- Helpers ranking: usage signals so the loader can promote helpers that
-- actually succeed over ones that just happen to come first alphabetically.
--
-- success_count   — incremented by the worker after a helper_call returns ok
-- failure_count   — incremented after a thrown / non-ok helper_call
-- last_used_at    — bumped on every invocation (success or failure)
--
-- ORDER BY (automation-scoped first, then last_used_at recency × success
-- ratio) lives in the worker's loadHelpersForRun query.

ALTER TABLE public.cloud_agent_helpers
  ADD COLUMN IF NOT EXISTS success_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at  timestamp with time zone NULL;

-- Speeds up the ORDER BY in loadHelpersForRun (workspace_id filter is
-- already covered by the active-lookup index; this adds the recency tail).
CREATE INDEX IF NOT EXISTS idx_cloud_agent_helpers_last_used
  ON public.cloud_agent_helpers (workspace_id, last_used_at DESC NULLS LAST);
