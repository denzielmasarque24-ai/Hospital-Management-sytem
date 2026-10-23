import Link from "next/link";

const footerLinks = [
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Services" },
  { href: "/products", label: "Products" },
  { href: "/doctors", label: "Find a Doctor" },
  { href: "/patient-information", label: "Patient Information" },
  { href: "/appointment", label: "Book Appointment" },
  { href: "/contact", label: "Message" },
  { href: "/careers", label: "Careers" },
];

const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/faq", label: "FAQ" },
  { href: "/help", label: "Help Center" },
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="logo footer-logo" aria-label="MedWell Medical Hospital footer logo">
            <span className="logo-icon">✚</span>
            <span>
              <strong>MedWell</strong>
              <small>MEDICAL HOSPITAL</small>
            </span>
          </div>
          <p className="footer-text">
            Supporting patients and families with accessible hospital information and care services.
          </p>
        </div>

        <div>
          <h4>Quick Links</h4>
          <ul className="footer-links">
            {footerLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Support</h4>
          <ul className="footer-links">
            {legalLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

      </div>

      <div className="container footer-bottom">
        <p>© 2026 MedWell Medical Hospital. All rights reserved.</p>
      </div>
    </footer>
  );
}
