import type { UserProfile } from "@/types/settings";

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function shouldUseLocalDevAuth() {
  return !hasSupabaseConfig() && process.env.NODE_ENV !== "production";
}

export const LOCAL_DEV_PROFILE: UserProfile = {
  id: "local-dev-owner",
  displayName: "basichome local owner",
  email: "local@basichome.dev",
};
