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
    const appointments=await patientRows(supabase,"appointments",user.id,"id,patient_id,doctor_id,service_id,appointment_date,appointment_time,status,notes,created_at",{orderBy:"appointment_date",ascending:false});
    const optional=async(label:string,run:()=>any,fallback:any):Promise<any>=>{try{const result=await run();if(result?.error)throw Object.assign(new Error(result.error.message),{code:result.error.code,table:label});return result?.data??fallback;}catch(error){const failure=error as {message?:string;code?:string;table?:string};console.error("[PatientAppointments] Optional query failed",JSON.stringify({table:failure.table||label,code:failure.code,message:failure.message}));return fallback;}};
    const [requestRows,services]=await Promise.all([
      optional("patient_appointment_change_requests",()=>supabase.from("patient_appointment_change_requests").select("id,appointment_id,request_type,requested_date,requested_time,reason,status,created_at").eq("patient_id",user.id).order("created_at",{ascending:false}),null),
      optional("services",()=>relatedRows(supabase,"services",appointments.map((row:any)=>row.service_id),"id,name,description"),[]),
    ]);
    const doctors=await optional("doctors",()=>relatedRows(supabase,"doctors",appointments.map((row:any)=>row.doctor_id),"id,display_name,specialty,department"),[]);
    const requestError=requestRows===null?"Appointment change requests could not be loaded.":"";
    const serviceById=new Map<string,any>(services.map((row:any)=>[row.id,row]));
    const doctorById=new Map<string,any>(doctors.map((row:any)=>[row.id,row]));
    const cards=appointments.sort((a:any,b:any)=>`${b.appointment_date}T${b.appointment_time}`.localeCompare(`${a.appointment_date}T${a.appointment_time}`)).map((row:any)=>{
      const doctor=row.doctor_id?doctorById.get(row.doctor_id):null,service=row.service_id?serviceById.get(row.service_id):null;
      return {id:row.id,service_name:service?.name||(row.service_id?"Service details unavailable":"Service not specified"),service_details:service?.description||"",department:doctor?.department||service?.name||"",doctor:row.doctor_id?doctor?doctorName(doctor):"Doctor details unavailable":"Doctor to be assigned",specialty:doctor?.specialty||"",preferred_date:row.appointment_date,preferred_time:row.appointment_time||"00:00:00",reason:row.notes||"",status:row.status,created_at:row.created_at,is_demo:isDemo(row)};
    });
    body=<PatientAppointments patientId={user.id} appointments={cards} requests={requestRows??[]} requestsError={requestError}/>;
  } catch(error) {
    const failure=error as {code?:string;table?:string};
    body=<section className="patient-card patient-query-error" role="alert"><h2>Appointments could not be loaded</h2><p>Please reload or contact your care team.</p><p>Reference: {failure.table || "appointments"} · {failure.code || "LOAD_FAILED"}</p><a className="patient-secondary-button" href="/patient/appointments">Try again</a></section>;
  }
  return <><section className="patient-page-heading patient-module-heading patient-appointments-banner"><div className="patient-appointment-art" aria-hidden="true"><Image src="/images/appointment.png" alt="" fill sizes="(min-width: 1200px) 360px, (min-width: 901px) 300px, 0px" className="patient-appointment-art-image" priority/></div><div className="patient-module-copy"><p className="patient-eyebrow">YOUR CARE</p><h1>My Appointments</h1><p>Review your appointments and request changes with your care team.</p></div><a className="patient-primary-button" href="/appointment">Book appointment</a></section>{body}</>;
}
