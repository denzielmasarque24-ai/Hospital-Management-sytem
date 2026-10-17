import { supabase } from "@/lib/supabase/client";
import { getRoleHomeForValue } from "./role-home.mjs";

export async function getRoleHomePath(user) {
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  if (!user?.id) throw new Error("AUTHENTICATED_USER_REQUIRED");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile?.role) {
    const missingProfileError = new Error("PROFILE_NOT_FOUND");
    missingProfileError.code = "PROFILE_NOT_FOUND";
    throw missingProfileError;
  }

  const destination = getRoleHomeForValue(profile.role);
  if (!destination) {
    const unknownRoleError = new Error("UNKNOWN_PROFILE_ROLE");
    unknownRoleError.code = "UNKNOWN_PROFILE_ROLE";
    throw unknownRoleError;
  }

  return destination;
}
