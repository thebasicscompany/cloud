-- PHASE-1-3 item 1: per-resource private/shared visibility.
--
-- Today every read filters only by workspace_id, so every member sees
-- every other member's connections / runs / automations / agents. That's
-- fine in a single-user workspace but breaks in a team where someone
-- wants a private agent or doesn't want their experimental run visible
-- to the whole team.
--
-- Default for new + backfilled rows = 'shared' (current behaviour). When
-- visibility='private' the row is only visible to its creator + workspace
-- admins/owners. Routes enforce this filter.
--
-- created_by is added where missing so the filter has someone to compare
-- against. Existing rows that don't track creator stay as 'shared' (visible
-- to all) — there's no way to retro-attribute them.

-- cloud_runs already has account_id; reuse that as creator and just add
-- visibility.
ALTER TABLE public.cloud_runs
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('private','shared'));

CREATE INDEX IF NOT EXISTS idx_cloud_runs_ws_visibility
  ON public.cloud_runs (workspace_id, visibility);

-- automations: same.
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('private','shared'));
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS created_by uuid;
UPDATE public.automations SET created_by = account_id WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_automations_ws_visibility
  ON public.automations (workspace_id, visibility);

-- client_agents: already has created_by (uuid → account_id). Add visibility.
ALTER TABLE public.client_agents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('private','shared'));

CREATE INDEX IF NOT EXISTS idx_client_agents_ws_visibility
  ON public.client_agents (workspace_id, visibility);

-- workspace_browser_sites: per-host cookies. Often personal. Default shared
-- (no behaviour change), creator gets to flip private if they want.
ALTER TABLE public.workspace_browser_sites
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('private','shared'));
ALTER TABLE public.workspace_browser_sites
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- workspace_credentials: private by default makes more sense (each user's
-- own API key is theirs), but defaulting to shared preserves the current
-- behaviour where any teammate can use a posted credential. Flip in a
-- follow-up if the team-mode UX wants the opposite.
ALTER TABLE public.workspace_credentials
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('private','shared'));
ALTER TABLE public.workspace_credentials
  ADD COLUMN IF NOT EXISTS created_by uuid;
