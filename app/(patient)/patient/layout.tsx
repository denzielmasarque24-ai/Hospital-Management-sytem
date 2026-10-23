import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./patient.css";

export default async function PatientLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?message=Patient%20pages%20are%20temporarily%20unavailable.");
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !user.email_confirmed_at) redirect("/login?next=%2Fpatient%2Fprofile");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError) {
    console.error("[PatientDashboard] Supabase query failed", JSON.stringify({ table: "profiles", operation: "select role", filter: "id = authenticated user id", code: profileError.code, message: profileError.message, details: profileError.details, hint: profileError.hint }));
  }
  if (String(profile?.role ?? "").toUpperCase() !== "PATIENT") redirect("/");

  return <div className="patient-portal"><Header /><main className="patient-content">{children}</main></div>;
}
