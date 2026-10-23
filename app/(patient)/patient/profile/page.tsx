import { PatientProfileForm } from "@/components/patient/PatientProfileForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PatientProfilePage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,email,role,avatar_url,created_at,updated_at,first_name,middle_name,last_name,suffix,gender,date_of_birth,birthday,mobile_number,username")
    .eq("id", user.id).maybeSingle();

  if (error) console.error("[PatientDashboard] Supabase query failed", JSON.stringify({ table: "profiles", operation: "select patient profile", filter: "id = authenticated user id", code: error.code, message: error.message, details: error.details, hint: error.hint }));

  if (error || !profile) return <div className="patient-profile-page">
    <section className="patient-card patient-query-error" role="alert">{error ? `Your profile could not be loaded${error.code ? ` (${error.code})` : ""}: ${error.message}` : "Your profile could not be found."}</section>
  </div>;

  return <PatientProfileForm userId={user.id} email={profile.email || user.email || ""} createdAt={profile.created_at || null} updatedAt={profile.updated_at || null} initialProfile={{
    first_name: profile.first_name || "", middle_name: profile.middle_name || "", last_name: profile.last_name || "", suffix: profile.suffix || "",
    gender: profile.gender || "", date_of_birth: profile.date_of_birth || profile.birthday || "", mobile_number: profile.mobile_number || "",
    username: profile.username || "", avatar_url: profile.avatar_url || user.user_metadata?.avatar_url || "",
  }} />;
}
