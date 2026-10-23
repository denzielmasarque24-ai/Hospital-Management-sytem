import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import HomePage from "@/app/(app)/(website)/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to your MedWell Medical Hospital account.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; message?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  let user = null;
  if (supabase) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (session && !sessionError) {
      const { data, error } = await supabase.auth.getUser();
      if (!error) user = data.user;
    }
  }
  if (user) {
    const { data: profile } = await supabase!.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = String(profile?.role ?? "").toUpperCase();
    if (role === "PATIENT") redirect("/");
    if (["ADMIN", "SUPER_ADMIN", "INVENTORY_MANAGER", "SALES_STAFF"].includes(role)) redirect("/admin");
  }
  return (
    <>
      <Header initialAuthOpen authMessage={params.message} />
      <main><HomePage /></main>
      <Footer />
    </>
  );
}
