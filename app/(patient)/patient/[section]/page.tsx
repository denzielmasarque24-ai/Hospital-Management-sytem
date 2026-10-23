import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { BedDouble, CreditCard, HeartPulse, Package, Stethoscope } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadPatientSection } from "@/lib/patient/queries.mjs";
import PatientSectionContent from "@/components/patient/PatientSectionContent";

export const dynamic = "force-dynamic";
const sections = {
  "assigned-doctor": {title:"My Assigned Doctor",eyebrow:"YOUR CARE TEAM",icon:Stethoscope,description:"Meet the doctor assigned to support your care."},
  "medical-history": {title:"My Medical History",eyebrow:"YOUR HEALTH RECORDS",icon:HeartPulse,description:"Review records shared by your MedWell care team."},
  admissions: {title:"My Admissions",eyebrow:"YOUR HOSPITAL CARE",icon:HeartPulse,description:"Review your current and past hospital admissions."},
  "room-information": {title:"My Room Information",eyebrow:"YOUR STAY",icon:BedDouble,description:"See room details connected to your admission."},
  billing: {title:"My Bills & Payments",eyebrow:"YOUR PAYMENTS",icon:CreditCard,description:"Review itemized bills, make payments, and track your balance."},
  "medical-supplies": {title:"Medical Supplies & Charges",eyebrow:"YOUR CARE DETAILS",icon:Package,description:"Review supplies and charges recorded for your care."},
};

export default async function PatientSectionPage({params}:{params:Promise<{section:string}>}) {
  const {section}=await params;
  if (!(section in sections)) notFound();
  const content=sections[section as keyof typeof sections];
  const Icon=content.icon;
  const client=await createSupabaseServerClient();
  if(!client) redirect("/login");
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError || !user || !user.email_confirmed_at) redirect("/login");
  let body;
  try {
    const data=await loadPatientSection(client,user.id,section);
    body=<PatientSectionContent section={section} data={data}/>;
  } catch(error) {
    const failure=error as {code?:string;table?:string;message?:string};
    body=<section className="patient-card patient-query-error" role="alert"><h2>{section === "billing" ? "Billing records could not be loaded" : "We could not load this section"}</h2><p>{failure.message || "Please reload the page. If this continues, contact the hospital."} Please retry; if it continues, share the reference below with the hospital.</p><p className="patient-muted">Reference: {failure.table || section} · {failure.code || "LOAD_FAILED"}</p><a className="patient-secondary-button" href={`/patient/${section}`}>Try again</a></section>;
  }
  return <><div className={`patient-page-heading patient-module-heading${section === "medical-history" ? " patient-medical-history-banner" : section === "assigned-doctor" ? " patient-assigned-doctor-banner" : ""}`}><div className="patient-module-copy"><p className="patient-eyebrow">{content.eyebrow}</p><h1>{content.title}</h1><p>{content.description}</p></div>{section === "medical-history" ? <div className="patient-medical-history-art" aria-hidden="true"><Image src="/images/history.png" alt="" fill sizes="(min-width: 1024px) 300px, 220px" className="patient-medical-history-art-image" priority/></div> : section === "assigned-doctor" ? <div className="patient-assigned-doctor-art" aria-hidden="true"><Image src="/images/doctor.png" alt="" fill sizes="(min-width: 1024px) 300px, 220px" className="patient-assigned-doctor-art-image" priority/></div> : <span className="patient-module-illustration" aria-hidden="true"><Icon size={72} strokeWidth={1.35}/><i>+</i></span>}</div>{body}</>;
}
