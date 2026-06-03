-- PHASE-1-3 item 8: subscriptions + workspace_invitations migrations.
-- The team + billing code reads/writes these tables via supabase admin, but
-- no CREATE TABLE was ever written into drizzle/ so a clean DB would 500
-- on the first /v1/billing or /v1/team/invite call.
--
-- Schemas match SubscriptionRow (api/src/lib/billing.ts) and INVITE_COLS
-- (api/src/routes/team.ts) exactly. Also adds workspace_members.seat_status
-- (item 8 calls this out as missing) so seat-limit enforcement at invite
-- time can read it.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  workspace_id            uuid PRIMARY KEY,
  plan                    text NOT NULL DEFAULT 'free',
  seat_count              integer NOT NULL DEFAULT 1,
  price_per_seat_cents    integer NOT NULL DEFAULT 0,
  status                  text NOT NULL DEFAULT 'active',
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_start    timestamp with time zone,
  current_period_end      timestamp with time zone,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  created_at              timestamp with time zone NOT NULL DEFAULT now(),
  updated_at              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_plan_check  CHECK (plan IN ('free','pro','team','enterprise')),
  CONSTRAINT subscriptions_status_check CHECK (status IN ('active','past_due','canceled','unpaid','trialing','incomplete'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.subscriptions (status);

CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL,
  email         text NOT NULL,
  role          text NOT NULL DEFAULT 'member',
  -- Cryptographically random URL-safe string — the credential the accept
  -- page is built around. Indexed unique so we can lookup-by-token.
  token         text NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  expires_at    timestamp with time zone NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at   timestamp with time zone,
  invited_by    uuid,
  accepted_by   uuid,
  CONSTRAINT workspace_invitations_role_check
    CHECK (role IN ('owner','admin','member','viewer')),
  CONSTRAINT workspace_invitations_status_check
    CHECK (status IN ('pending','accepted','revoked','expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_invitations_token
  ON public.workspace_invitations (token);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_ws_email
  ON public.workspace_invitations (workspace_id, lower(email));

-- Seat-status on workspace_members so the seat-limit enforcer can count
-- only ACTIVE seats (not invited/suspended/etc).
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS seat_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_seat_status_check;
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_seat_status_check
    CHECK (seat_status IN ('active','invited','suspended','removed'));

-- Item 3 also calls out that the 0008 role CHECK constraint doesn't allow
-- 'viewer' yet, even though jwt.ts ROLE_RANK / the team console list it.
-- Align them here so inviting a viewer doesn't violate the constraint.
ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check
    CHECK (role IN ('owner','admin','member','viewer'));
