import Link from "next/link";

const footerLinks = [
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Services" },
  { href: "/products", label: "Products" },
  { href: "/doctors", label: "Find a Doctor" },
  { href: "/appointment", label: "Book Appointment" },
  { href: "/contact", label: "Message" },
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
          <div className="logo footer-logo" aria-label="MediWell Pharma footer logo">
            <span className="logo-icon">✚</span>
            <span>
              <strong>MediWell</strong>
              <small>PHARMA</small>
            </span>
          </div>
          <p className="footer-text">
            Delivering trusted healthcare, innovative medicines, and compassionate care for every family.
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
        <p>© 2026 MediWell Pharma. All rights reserved.</p>
      </div>
    </footer>
  );
}
