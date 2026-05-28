import { redirect } from "next/navigation";

import { ProfileSettingsView } from "../_components/profile-settings-view";
import { userProfileFromSupabase } from "@/lib/auth/user-profile";
import { LOCAL_DEV_PROFILE, shouldUseLocalDevAuth } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  if (shouldUseLocalDevAuth()) {
    return <ProfileSettingsView profile={LOCAL_DEV_PROFILE} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/v2/login");
  }

  return <ProfileSettingsView profile={userProfileFromSupabase(user)} />;
}
