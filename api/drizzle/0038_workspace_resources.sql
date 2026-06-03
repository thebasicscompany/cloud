-- Workspace resources registry. Tracks long-lived artifacts (Notion pages,
-- Google docs/sheets, Airtable bases, Slack channels, Linear projects, ...)
-- the workspace cares about - either because an agent created them on a
-- previous run, or because the user added them manually so future runs can
-- point at / edit them.
--
-- Two key user-facing dials per resource:
--   source       - "agent_created" | "user_added"
--   agent_access - "none" | "read" | "read_write"
-- The system prompt for each run injects the list of resources where
-- agent_access != 'none', tagged with the access mode, so the agent knows
-- (a) what exists, (b) whether it can edit, (c) when to add to / edit
-- an existing thing rather than create a parallel copy.
--
-- The (workspace_id, kind, external_id) uniqueness keeps duplicate Composio
-- create calls from polluting the registry; NULLS NOT DISTINCT so manually
-- added entries without an external_id don't all collide on NULL.

CREATE TABLE IF NOT EXISTS public.workspace_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Free-form so we don't have to maintain an exhaustive enum across the
  -- ever-growing Composio toolkit catalog. Examples: "notion_page",
  -- "notion_database", "google_doc", "google_sheet", "google_drive_folder",
  -- "airtable_base", "slack_channel", "linear_project", "github_repo".
  kind text NOT NULL,

  -- Human-readable name shown in UI and to the agent.
  name text NOT NULL,

  -- Canonical user-facing URL (the link a human would click).
  url text,

  -- External system identifier (e.g. Notion page id, Google file id,
  -- Airtable base id, Linear project id). This is what the agent uses to
  -- call back into the system - the URL is for humans.
  external_id text,

  -- Free-form user notes ("use for all customer follow-ups", "only Q3
  -- numbers go here", ...). Surfaces to the agent so it can respect intent.
  description text,

  -- "agent_created" = an agent run made it via a Composio create call
  --   and registered it via the resource_register worker tool.
  -- "user_added" = the user pasted/imported the link in settings.
  source text NOT NULL DEFAULT 'user_added'
    CHECK (source IN ('agent_created', 'user_added')),

  -- "none"       = off-limits; do NOT inject into the system prompt at all.
  -- "read"       = inject + allow read tools but block writes.
  -- "read_write" = inject + allow full edit / append (the default).
  -- Enforcement is a system-prompt convention today; future tool-call
  -- guards could hard-block based on this.
  agent_access text NOT NULL DEFAULT 'read_write'
    CHECK (agent_access IN ('none', 'read', 'read_write')),

  -- Composio toolkit slug the agent uses to act on this resource (e.g.
  -- "notion", "googledocs"). Optional - for non-Composio resources (e.g.
  -- "raw file path on user's machine") this stays null.
  toolkit_slug text,

  -- Per-resource metadata blob. Agents are free to stash inferred schema
  -- ("column names of the airtable base"), parent IDs, last activity, etc.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Whoever added the row. Composio runs file under the worker's
  -- composio_user_id (account_id || workspace_id).
  created_by uuid,

  -- Which cloud run created this (when source='agent_created'). Lets the
  -- UI link back to the run that built the artifact. Null for user_added.
  created_by_run_id uuid REFERENCES public.cloud_runs(id) ON DELETE SET NULL,

  -- Dedupe agent_created rows on (workspace, kind, external_id). NULLS NOT
  -- DISTINCT so multiple user_added entries with null external_id can
  -- coexist (e.g. two different folders that the user hasn't IDd yet).
  CONSTRAINT workspace_resources_workspace_kind_external_uniq
    UNIQUE NULLS NOT DISTINCT (workspace_id, kind, external_id)
);

CREATE INDEX IF NOT EXISTS workspace_resources_workspace_id_idx
  ON public.workspace_resources (workspace_id);

CREATE INDEX IF NOT EXISTS workspace_resources_workspace_kind_idx
  ON public.workspace_resources (workspace_id, kind);

-- Keep updated_at honest on edits.
CREATE OR REPLACE FUNCTION public.workspace_resources_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_resources_touch_updated_at ON public.workspace_resources;
CREATE TRIGGER workspace_resources_touch_updated_at
  BEFORE UPDATE ON public.workspace_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_resources_touch_updated_at();
