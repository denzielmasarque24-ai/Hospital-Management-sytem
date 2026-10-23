import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Clock3, FileText, HeartHandshake, MapPin, Phone, Stethoscope } from "lucide-react";
import { redirect } from "next/navigation";

import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicContact, getPublicDoctors, getPublicServices } from "@/lib/services/public-service";

export const metadata: Metadata = {
  title: "Book Appointment",
  description: "Request an appointment with MedWell Medical Hospital. Requests are reviewed by the hospital team.",
};

const errorMessage = (reason: unknown) => reason instanceof Error ? reason.message : "The service is temporarily unavailable.";

export default async function AppointmentPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") query.set(key, value);
      else value?.forEach((item) => query.append(key, item));
    }
    const next = `/appointment${query.size ? `?${query.toString()}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}&message=${encodeURIComponent("Please log in to book an appointment.")}`);
  }

  const [servicesResult, doctorsResult, contactResult] = await Promise.allSettled([
    getPublicServices(), getPublicDoctors(), getPublicContact(),
  ]);
  const services = servicesResult.status === "fulfilled" ? servicesResult.value : [];
  const doctors = doctorsResult.status === "fulfilled" ? doctorsResult.value : [];
  const contact = contactResult.status === "fulfilled" ? contactResult.value : null;
  const serviceSlug = typeof params.service === "string" ? params.service : "";
  const defaultServiceId = services.find((service) => service.slug === serviceSlug)?.id ?? "";
  const requestedDoctorId = typeof params.doctor === "string" ? params.doctor : "";
  const defaultDoctorId = doctors.find(doctor => doctor.id === requestedDoctorId && (doctor.available === true || doctor.available === "true"))?.id ?? "";

  return <main className="booking-page">
    <div className="container booking-container">
      <section className="booking-hero" aria-labelledby="booking-title">
        <div className="booking-hero-copy">
          <nav className="booking-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">Book Appointment</span>
          </nav>
          <span className="booking-hero-icon"><CalendarDays size={23} aria-hidden="true" /></span>
          <h1 id="booking-title">Book Appointment</h1>
          <p>Choose from the current department list and submit your preferred date and time. This form sends an appointment request; it is not confirmed until the hospital contacts you.</p>
        </div>
        <div className="booking-hero-art" role="img" aria-label="Doctor with the message Your Health, Our Priority" />
      </section>

      <div className="booking-layout">
        <div className="booking-main-column">
          <AppointmentForm
            services={services}
            doctors={doctors.filter((doctor) => doctor.available === true || doctor.available === "true")}
            defaultServiceId={defaultServiceId}
            defaultDoctorId={defaultDoctorId}
            requestedDoctorUnavailable={Boolean(requestedDoctorId && !defaultDoctorId && doctorsResult.status === "fulfilled")}
            requestedServiceUnavailable={Boolean(serviceSlug && !defaultServiceId && servicesResult.status === "fulfilled")}
            servicesError={servicesResult.status === "rejected" ? errorMessage(servicesResult.reason) : ""}
            doctorsError={doctorsResult.status === "rejected" ? errorMessage(doctorsResult.reason) : ""}
          />
        </div>

        <aside className="booking-sidebar" aria-label="Appointment help and reminders">
          <section className="booking-help-card">
            <div className="booking-sidebar-heading"><span><HeartHandshake size={21} aria-hidden="true" /></span><h2>Need Help?</h2></div>
            <p>If you need immediate assistance or have urgent concerns, please contact our hospital directly.</p>
            {contact?.phone ? <a className="booking-contact-row" href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}><Phone size={17} aria-hidden="true" /><span><small>Call the hospital</small><strong>{contact.phone}</strong></span></a> : <p className="booking-contact-missing">Contact details are not currently available. Send the hospital a message for assistance.</p>}
            {contact?.operating_hours && <div className="booking-contact-row"><Clock3 size={17} aria-hidden="true" /><span><small>Configured hours</small><strong>{contact.operating_hours}</strong></span></div>}
            {contact?.address && <div className="booking-contact-row"><MapPin size={17} aria-hidden="true" /><span><small>Hospital address</small><strong>{contact.address}</strong></span></div>}
            <Link className="booking-contact-link" href="/contact">Contact the care team <ArrowRight size={15} aria-hidden="true" /></Link>
          </section>

          <section className="booking-reminders-card">
            <div className="booking-sidebar-heading"><span><FileText size={21} aria-hidden="true" /></span><h2>Important Reminders</h2></div>
            <ul>
              <li><CheckCircle2 size={17} aria-hidden="true" /><span>This is a request only. The hospital will contact you to confirm.</span></li>
              <li><CheckCircle2 size={17} aria-hidden="true" /><span>Select a preferred date and time for your request.</span></li>
              <li><CheckCircle2 size={17} aria-hidden="true" /><span>Choose a specific doctor or leave the preference as “No preference.”</span></li>
              <li><Stethoscope size={17} aria-hidden="true" /><span>For emergencies, contact emergency services or seek immediate medical care.</span></li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  </main>;
}
