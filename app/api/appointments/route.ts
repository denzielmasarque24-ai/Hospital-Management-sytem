import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown, maxLength: number) => typeof value === "string" && value.trim().length <= maxLength ? value.trim() : null;
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const hospitalToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Booking is temporarily unavailable because Supabase is not configured." }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Please log in to book an appointment.", loginUrl: "/login?next=%2Fappointment" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid booking details. Please submit the form again." }, { status: 400 }); }

  const rawServiceId = body.serviceId;
  const serviceNotProvided = rawServiceId == null || (typeof rawServiceId === "string" && ["", "null"].includes(rawServiceId.trim().toLowerCase()));
  const serviceId = serviceNotProvided ? null : text(rawServiceId, 36);
  const doctorId = body.doctorId === "" || body.doctorId == null ? null : text(body.doctorId, 36);
  const appointmentDate = text(body.appointmentDate, 10);
  const appointmentTime = text(body.appointmentTime, 5);
  const notes = text(body.notes, 500) || null;
  if ((!serviceNotProvided && (!serviceId || !UUID.test(serviceId))) || (doctorId && !UUID.test(doctorId))) {
    return NextResponse.json({ error: "Choose a valid department or service and doctor." }, { status: 400 });
  }
  if (!appointmentDate || !validDate(appointmentDate) || !appointmentTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(appointmentTime)) {
    return NextResponse.json({ error: "Enter a valid appointment date and time." }, { status: 400 });
  }
  if (appointmentDate < hospitalToday()) {
    return NextResponse.json({ error: "Choose today or a future date for your appointment request." }, { status: 400 });
  }

  if (serviceId) {
    const { data: service, error: serviceError } = await supabase.from("services")
      .select("id").eq("id", serviceId).eq("available", true).maybeSingle();
    if (serviceError) {
      console.error("[Appointments] Service validation failed", { code: serviceError.code, message: serviceError.message, details: serviceError.details, hint: serviceError.hint });
      return NextResponse.json({ error: `Could not verify the selected service${serviceError.code ? ` (${serviceError.code})` : ""}: ${serviceError.message}` }, { status: serviceError.code === "42501" ? 403 : 500 });
    }
    if (!service) return NextResponse.json({ error: "Select a department or service currently listed by the hospital." }, { status: 400 });
  }

  if (doctorId) {
    const { data: doctor, error: doctorError } = await supabase.from("doctors")
      .select("id").eq("id", doctorId).eq("available", true).maybeSingle();
    if (doctorError) {
      console.error("[Appointments] Doctor validation failed", { code: doctorError.code, message: doctorError.message, details: doctorError.details, hint: doctorError.hint });
      return NextResponse.json({ error: `Could not verify the selected doctor${doctorError.code ? ` (${doctorError.code})` : ""}: ${doctorError.message}` }, { status: doctorError.code === "42501" ? 403 : 500 });
    }
    if (!doctor) return NextResponse.json({ error: "Select a doctor who is currently available, or choose no preference." }, { status: 400 });
  }

  // Preserve the existing submit lock and reject repeat active requests before
  // writing. RLS scopes this lookup to the current authenticated patient.
  let duplicateQuery = supabase.from("appointments").select("id")
    .eq("patient_id", user.id)
    .eq("appointment_date", appointmentDate).eq("appointment_time", appointmentTime)
    .in("status", ["pending", "confirmed"]);
  duplicateQuery = serviceId ? duplicateQuery.eq("service_id", serviceId) : duplicateQuery.is("service_id", null);
  duplicateQuery = doctorId ? duplicateQuery.eq("doctor_id", doctorId) : duplicateQuery.is("doctor_id", null);
  const { data: duplicates, error: duplicateError } = await duplicateQuery.limit(1);
  if (duplicateError) return NextResponse.json({ error: "We could not check for existing appointments. Please try again." }, { status: 503 });
  if (duplicates?.length) return NextResponse.json({ error: "You already have an active appointment request for this doctor, service, date, and time." }, { status: 409 });

  const { data, error } = await supabase.from("appointments").insert({
    patient_id: user.id,
    doctor_id: doctorId,
    service_id: serviceId,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    status: "pending",
    notes,
  }).select("id").single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "This appointment request already exists. Check My Appointments before trying again." }, { status: 409 });
    console.error("[Appointments] Booking insert failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    const status = error.code === "42501" ? 403 : ["22P02", "23502", "23503", "23514", "22007", "22008"].includes(error.code ?? "") ? 400 : 500;
    return NextResponse.json({ error: `Appointment could not be saved${error.code ? ` (${error.code})` : ""}: ${error.message}` }, { status });
  }
  if (!data?.id) return NextResponse.json({ error: "The database did not confirm that the appointment was saved." }, { status: 500 });

  return NextResponse.json({ success: true, appointmentId: data.id, status: "pending" }, { status: 201 });
}
