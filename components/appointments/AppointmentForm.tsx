"use client";

import { FormEvent, useState } from "react";

const departments = [
  "Cardiology",
  "Neurology",
  "Pediatrics",
  "General Medicine",
  "Diagnostic Services",
];

export function AppointmentForm() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <form className="appointment-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          <span>Patient Name</span>
          <input type="text" placeholder="Your full name" required />
        </label>
        <label>
          <span>Email</span>
          <input type="email" placeholder="you@example.com" required />
        </label>
        <label>
          <span>Phone</span>
          <input type="tel" placeholder="+1 234 567 8900" required />
        </label>
        <label>
          <span>Department</span>
          <select defaultValue="" required>
            <option value="" disabled>
              Select department
            </option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Doctor</span>
          <input type="text" placeholder="Preferred doctor" />
        </label>
        <label>
          <span>Preferred Date</span>
          <input type="date" required />
        </label>
        <label>
          <span>Preferred Time</span>
          <input type="time" required />
        </label>
        <label>
          <span>Reason for Visit</span>
          <input type="text" placeholder="Brief reason" required />
        </label>
      </div>

      <button type="submit" className="btn-primary submit-button">
        Confirm Appointment
      </button>

      {submitted ? <p className="success-message">Appointment requested successfully. Our team will contact you shortly.</p> : null}
    </form>
  );
}
