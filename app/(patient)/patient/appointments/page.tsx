import { redirect } from "next/navigation";
import Image from "next/image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PatientAppointments from "@/components/patient/PatientAppointments";
import { patientRows, relatedRows } from "@/lib/patient/queries.mjs";
import { doctorName, isDemo } from "@/lib/patient/dashboard.mjs";

export const dynamic = "force-dynamic";

export default async function PatientAppointmentsPage() {
  const supabase=await createSupabaseServerClient();
  if(!supabase) redirect("/login");
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError || !user || !user.email_confirmed_at) redirect("/login");
  let body;
  try {
    const [appointments,requestResult]=await Promise.all([
      patientRows(supabase,"appointments",user.id),
      supabase.from("patient_appointment_change_requests").select("id,appointment_id,request_type,requested_date,requested_time,reason,status,created_at").eq("patient_id",user.id).order("created_at",{ascending:false}),
    ]);
    const [services,doctors]=await Promise.all([
      relatedRows(supabase,"services",appointments.map(row=>row.service_id)),
      relatedRows(supabase,"doctors",appointments.map(row=>row.doctor_id)),
    ]);
    if(requestResult.error) console.error("[PatientDashboard] Supabase query failed", JSON.stringify({ table: "patient_appointment_change_requests", operation: "select appointment change requests", filter: "patient_id = authenticated user id", code: requestResult.error.code, message: requestResult.error.message, details: requestResult.error.details, hint: requestResult.error.hint }));
    const serviceById=new Map(services.map(row=>[row.id,row]));
    const doctorById=new Map(doctors.map(row=>[row.id,row]));
    const cards=appointments.sort((a,b)=>`${b.appointment_date}T${b.appointment_time}`.localeCompare(`${a.appointment_date}T${a.appointment_time}`)).map(row=>{
      const doctor=doctorById.get(row.doctor_id),service=serviceById.get(row.service_id);
      return {id:row.id,department:service?.name || "Service details unavailable",service_details:service?.short_description || service?.description || "",doctor:row.doctor_id ? doctorName(doctor) : "Doctor to be assigned",specialty:doctor?.specialty || doctor?.specialization || "",preferred_date:row.appointment_date,preferred_time:row.appointment_time || "00:00:00",reason:row.notes || "",status:row.status,created_at:row.created_at,is_demo:isDemo(row)};
    });
    body=<PatientAppointments patientId={user.id} appointments={cards} requests={requestResult.data ?? []} requestsError={requestResult.error ? `Appointment change requests could not be loaded (${requestResult.error.code || "QUERY_FAILED"}). Please reload or contact the care team.` : ""}/>;
  } catch(error) {
    const failure=error as {code?:string;table?:string};
    body=<section className="patient-card patient-query-error" role="alert"><h2>Appointments could not be loaded</h2><p>Please reload or contact your care team.</p><p>Reference: {failure.table || "appointments"} · {failure.code || "LOAD_FAILED"}</p><a className="patient-secondary-button" href="/patient/appointments">Try again</a></section>;
  }
  return <><section className="patient-page-heading patient-module-heading patient-appointments-banner"><div className="patient-appointment-art" aria-hidden="true"><Image src="/images/appointment.png" alt="" fill sizes="(min-width: 1200px) 360px, (min-width: 901px) 300px, 0px" className="patient-appointment-art-image" priority/></div><div className="patient-module-copy"><p className="patient-eyebrow">YOUR CARE</p><h1>My Appointments</h1><p>Review your appointments and request changes with your care team.</p></div><a className="patient-primary-button" href="/appointment">Book appointment</a></section>{body}</>;
}
