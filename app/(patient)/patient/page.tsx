import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadPatientSection } from "@/lib/patient/queries.mjs";
import PatientHome from "@/components/patient/PatientHome";
export const dynamic="force-dynamic";
export default async function PatientHomePage(){const supabase=await createSupabaseServerClient();if(!supabase)redirect("/login");const {data:{user},error}=await supabase.auth.getUser();if(error||!user||!user.email_confirmed_at)redirect("/login");try{return <PatientHome data={await loadPatientSection(supabase,user.id,"dashboard-home") as any}/>;}catch(e){const err=e as {message?:string;code?:string;table?:string};return <section className="patient-card patient-query-error" role="alert"><h2>Your patient dashboard could not be loaded</h2><p>{err.message||"Please try again."}</p><p>Reference: {err.table||"dashboard"} · {err.code||"LOAD_FAILED"}</p><a className="patient-secondary-button" href="/patient">Retry</a></section>;}}
