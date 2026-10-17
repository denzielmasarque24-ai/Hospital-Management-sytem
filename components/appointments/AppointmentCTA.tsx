import Link from "next/link";

type AppointmentCTAProps = {
  title?: string;
  description?: string;
  buttonLabel?: string;
  href?: string;
};

export function AppointmentCTA({
  title = "Ready to Start Your Care Journey?",
  description = "Connect with our specialists and book an appointment today.",
  buttonLabel = "Book Appointment",
  href = "/appointment",
}: AppointmentCTAProps) {
  return (
    <section className="appointment-cta-wrap">
      <div className="container appointment-cta">
        <div>
          <span className="section-eyebrow light">Trusted care</span>
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
