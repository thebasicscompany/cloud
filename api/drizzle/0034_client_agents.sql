-- Workspace-scoped, user-named agents.
--
-- An agent is a reusable worker definition: instructions, target surface
-- (cloud | computer | chrome), allowlisted tools, and optional cron
-- schedule. When `schedule.enabled` is true the route layer mirrors the
-- agent into `public.automations` so the existing trigger registration /
-- dispatcher path fires it; the resulting automation id is stored on
-- `automation_id` so edits/deletes stay in sync.

CREATE TABLE IF NOT EXISTS "client_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "avatar" text,
  "instructions" text NOT NULL,
  "target" text NOT NULL,
  "tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "schedule" jsonb,
  "automation_id" uuid,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "client_agents_target_check"
    CHECK ("target" IN ('cloud', 'computer', 'chrome'))
);

CREATE INDEX IF NOT EXISTS "client_agents_workspace_updated_idx"
  ON "client_agents" ("workspace_id", "updated_at");
