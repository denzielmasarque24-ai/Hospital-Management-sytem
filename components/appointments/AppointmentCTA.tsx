import Link from "next/link";

type AppointmentCTAProps = {
  title?: string;
  description?: string;
  buttonLabel?: string;
  href?: string;
};

export function AppointmentCTA({
  title = "Ready to Start Your Care Journey?",
  description = "Review available services and submit an appointment request. The hospital team will contact you to confirm details.",
  buttonLabel = "Book Appointment",
  href = "/appointment",
}: AppointmentCTAProps) {
  return (
    <section className="appointment-cta-wrap">
      <div className="container appointment-cta">
        <div>
          <span className="section-eyebrow light">Appointment requests</span>
          <h2>{title}</h2>
        </div>
        <p>{description}</p>
        <Link href={href} className="btn-primary light">
          {buttonLabel}
        </Link>
      </div>
    </section>
  );
}
