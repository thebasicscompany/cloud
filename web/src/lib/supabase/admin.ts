import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only service-role Supabase client.
 *
 * Used by read-only server components (e.g. the Agent surface) to display the
 * real cloud-agent data (skills, helper modules, browser sessions, credentials)
 * that the opencode self-healing worker writes to the Basics project. Service
 * role bypasses RLS, so this MUST never be imported into a client component.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only env). When those
 * are not configured (e.g. pure local dev without the backend env), returns
 * null so callers can render a graceful "not connected" state instead of
 * crashing.
 */
let _admin: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!_admin) {
    _admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}
