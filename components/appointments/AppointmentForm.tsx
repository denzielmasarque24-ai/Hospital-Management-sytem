"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, FileText, Send, Stethoscope, UserRound } from "lucide-react";
import type { PublicDoctor, PublicServiceOption } from "@/lib/services/public-service";

function hospitalToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function AppointmentForm({ services, doctors, defaultServiceId = "", defaultDoctorId = "", servicesError = "", doctorsError = "", requestedServiceUnavailable = false, requestedDoctorUnavailable = false }: {
  services: PublicServiceOption[];
  doctors: PublicDoctor[];
  defaultServiceId?: string;
  defaultDoctorId?: string;
  servicesError?: string;
  doctorsError?: string;
  requestedServiceUnavailable?: boolean;
  requestedDoctorUnavailable?: boolean;
}) {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [minimumDate, setMinimumDate] = useState("");
  const [notesLength, setNotesLength] = useState(0);
  const [selectedDoctorId, setSelectedDoctorId] = useState(defaultDoctorId);
  const [selectedDoctorImageFailed, setSelectedDoctorImageFailed] = useState(false);
  const submissionLock = useRef(false);
  const selectedDoctor = doctors.find((doctor) => doctor.id === selectedDoctorId);
  const selectedDoctorImage = selectedDoctor?.image_url || selectedDoctor?.avatar_url || null;

  useEffect(() => setMinimumDate(hospitalToday()), []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionLock.current || servicesError) return;
    submissionLock.current = true;
    setError("");
    setSubmitted(false);
    setSubmitting(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: String(form.get("serviceId") ?? "").trim() || null,
          doctorId: form.get("doctorId"),
          appointmentDate: form.get("appointmentDate"),
          appointmentTime: form.get("appointmentTime"),
          notes: form.get("notes"),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        const query = new URLSearchParams();
        const selectedDoctor = String(form.get("doctorId") || "");
        const selectedService = services.find(service => service.id === form.get("serviceId"));
        if (selectedDoctor) query.set("doctor", selectedDoctor);
        if (selectedService) query.set("service", selectedService.slug);
        const next = `/appointment${query.size ? `?${query}` : ""}`;
        router.push(`/login?next=${encodeURIComponent(next)}&message=${encodeURIComponent("Please log in to book an appointment.")}`);
        return;
      }
      if (!response.ok) throw new Error(result.error || "We could not submit your appointment request.");
      setSubmitted(true);
      formElement.reset();
      setNotesLength(0);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We could not submit your appointment request.");
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  return <section className="booking-form-card" aria-labelledby="appointment-details-title">
    <header className="booking-form-heading">
      <span className="booking-form-heading-icon"><CalendarDays size={22} aria-hidden="true" /></span>
      <div><h2 id="appointment-details-title">Appointment Details</h2><p>Fill out the form below to request an appointment.</p></div>
    </header>
    <form className="booking-form" onSubmit={handleSubmit}>
      {servicesError && <p className="booking-alert booking-alert-error" role="alert">Department and service options could not be loaded: {servicesError}</p>}
      {doctorsError && <p className="booking-alert booking-alert-info" role="status">Doctor options could not be loaded. You can still submit a request with no doctor preference.</p>}
      {requestedServiceUnavailable && <p className="booking-alert booking-alert-info" role="status">That service is not currently available for online appointment requests. Choose an available option below or contact the hospital.</p>}
      {requestedDoctorUnavailable && <p className="booking-alert booking-alert-info" role="status">The selected doctor is unavailable for online booking. Choose another doctor or leave the preference as “No preference.”</p>}
      <div className="booking-fields-grid">
        <label className="booking-field">
          <span className="booking-label"><Stethoscope size={16} aria-hidden="true" /> Department or Service <b aria-hidden="true">*</b></span>
          <select name="serviceId" defaultValue={defaultServiceId} required disabled={!services.length || Boolean(servicesError)}>
            <option value="" disabled>Select a department or service</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
        <label className="booking-field">
          <span className="booking-label"><UserRound size={16} aria-hidden="true" /> Preferred Doctor <small>(Optional)</small></span>
          <select name="doctorId" value={selectedDoctorId} onChange={(event) => { setSelectedDoctorId(event.currentTarget.value); setSelectedDoctorImageFailed(false); }} disabled={Boolean(doctorsError)}>
            <option value="">No preference</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.display_name || "Doctor"}</option>)}
          </select>
          {selectedDoctor && <span className="booking-doctor-preview" aria-live="polite">
            {selectedDoctorImage && !selectedDoctorImageFailed
              ? <img src={selectedDoctorImage} alt={`Portrait of ${selectedDoctor.display_name || "selected doctor"}`} onError={() => setSelectedDoctorImageFailed(true)} />
              : <span className="booking-doctor-preview-fallback" aria-hidden="true"><UserRound size={19} /></span>}
            <span>{selectedDoctor.display_name || "Selected doctor"}<small>{selectedDoctor.specialty || "Specialization not listed"}</small></span>
          </span>}
        </label>
        <label className="booking-field">
          <span className="booking-label"><CalendarDays size={16} aria-hidden="true" /> Appointment Date <b aria-hidden="true">*</b></span>
          <input name="appointmentDate" type="date" min={minimumDate || undefined} required />
        </label>
        <label className="booking-field">
          <span className="booking-label"><Clock3 size={16} aria-hidden="true" /> Preferred Time <b aria-hidden="true">*</b></span>
          <input name="appointmentTime" type="time" required aria-describedby="appointment-time-note" />
          <small className="booking-field-note" id="appointment-time-note">Your selected time is a preference, not a confirmed appointment slot.</small>
        </label>
        <label className="booking-field booking-field-full">
          <span className="booking-label"><FileText size={16} aria-hidden="true" /> Notes <small>(Optional)</small></span>
          <textarea name="notes" placeholder="Share a brief note for the care team (e.g., reason for visit, symptoms, or special requests)" maxLength={500} rows={4} onChange={(event) => setNotesLength(event.currentTarget.value.length)} />
          <small className="booking-character-count" aria-live="polite">{notesLength}/500 characters</small>
        </label>
      </div>

      {!servicesError && services.length === 0 && <p className="booking-alert booking-alert-info" role="status">No bookable departments or services are currently configured. Please contact the hospital.</p>}
      <button type="submit" className="booking-submit" disabled={submitting || !services.length || Boolean(servicesError)}>
        <span>{submitting ? "Submitting request…" : "Request Appointment"}</span><Send size={17} aria-hidden="true" />
      </button>
      {error && <p className="booking-alert booking-alert-error" role="alert">{error}</p>}
      {submitted && <p className="booking-alert booking-alert-success" role="status">Your appointment request was saved as pending. The hospital team will contact you to confirm the appointment.</p>}
    </form>
  </section>;
}
