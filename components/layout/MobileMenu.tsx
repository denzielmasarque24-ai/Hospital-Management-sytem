import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type NavItem = {
  href: string;
  label: string;
};

type MobileMenuProps = {
  items: NavItem[];
  currentPath: string;
  servicesMenu: { label: string; href: string; children?: { label: string; href: string }[] }[];
  expandedServicesGroup: string | null;
  onToggleServicesGroup: (group: string) => void;
  mobileServicesExpanded: boolean;
  onToggleMobileServices: () => void;
  isOpen: boolean;
  isAuthenticated?: boolean;
  onClose: () => void;
  onOpenAuth: (mode: "login" | "register") => void;
};

export function MobileMenu({ items, currentPath, isOpen, isAuthenticated = false, servicesMenu, expandedServicesGroup, onToggleServicesGroup, mobileServicesExpanded, onToggleMobileServices, onClose, onOpenAuth }: MobileMenuProps) {
  const servicesRef = useRef<HTMLElement>(null);
  const [patientGuideExpanded, setPatientGuideExpanded] = useState(false);
  useEffect(() => {
    if (!isOpen || !mobileServicesExpanded) return;
    const closeOutside = (event: PointerEvent) => {
      if (!servicesRef.current?.contains(event.target as Node)) onToggleMobileServices();
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [isOpen, mobileServicesExpanded, onToggleMobileServices]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="mobile-panel" id="mobile-navigation" role="region" aria-label="Mobile navigation">
      <div className="mobile-panel-inner">
        {items.slice(0, 2).map((item) => {
          const isActive =
            currentPath === item.href ||
            (item.href !== "/" && currentPath.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={isActive ? "mobile-link active" : "mobile-link"}
            ><span className="nav-label">{item.label}</span></Link>
          );
        })}

        <section className="mobile-services" aria-label="Our Services" ref={servicesRef}>
          <button type="button" className={`mobile-link mobile-services-trigger${currentPath.startsWith("/services") || currentPath.startsWith("/clinical-departments") || currentPath.startsWith("/room-rates") ? " active" : ""}`} aria-expanded={mobileServicesExpanded} aria-controls="mobile-services-list" onClick={onToggleMobileServices}>
            <span className="nav-label">Our Services</span> <ChevronDown size={16} aria-hidden="true" className={mobileServicesExpanded ? "is-open" : ""}/>
          </button>
          {mobileServicesExpanded ? <div className="mobile-services-list" id="mobile-services-list">
            {servicesMenu.map((item) => <div className={`mobile-services-item${item.children ? " offers-price-menu" : ""}${item.children && (expandedServicesGroup === item.label || item.children.some((child) => currentPath === child.href || currentPath.startsWith(`${child.href}/`))) ? " is-active" : ""}`} key={item.label}>
              <Link href={item.href} aria-current={currentPath === item.href ? "page" : undefined} onClick={onClose}><span className="nav-label">{item.label}</span></Link>
              {item.children ? <>
                <button type="button" aria-label={`${expandedServicesGroup === item.label ? "Collapse" : "Expand"} ${item.label}`} aria-expanded={expandedServicesGroup === item.label} onClick={() => onToggleServicesGroup(item.label)}><ChevronDown size={16} aria-hidden="true"/></button>
                {expandedServicesGroup === item.label ? <div className="mobile-services-submenu">{item.children.map((child) => <Link href={child.href} key={child.href} aria-current={currentPath === child.href ? "page" : undefined} onClick={onClose}><span className="nav-label">{child.label}</span></Link>)}</div> : null}
              </> : null}
            </div>)}
          </div> : null}
        </section>

        <section className="mobile-services mobile-patient-guide" aria-label="Patient Guide">
          <button type="button" className={`mobile-link mobile-services-trigger${currentPath.startsWith("/patient-guide") ? " active" : ""}`} aria-expanded={patientGuideExpanded} aria-controls="mobile-patient-guide-list" onClick={() => setPatientGuideExpanded((expanded) => !expanded)}>
            <span className="nav-label">Patient Guide</span> <ChevronDown size={16} aria-hidden="true" className={patientGuideExpanded ? "is-open" : ""} />
          </button>
          {patientGuideExpanded ? <div className="mobile-services-list" id="mobile-patient-guide-list"><div className="mobile-services-item"><Link href="/patient-guide/admission" aria-current={currentPath === "/patient-guide/admission" ? "page" : undefined} onClick={onClose}><span className="nav-label">How to Get Admitted</span></Link></div><div className="mobile-services-item"><Link href="/patient-guide/hmos-insurances" aria-current={currentPath === "/patient-guide/hmos-insurances" ? "page" : undefined} onClick={onClose}><span className="nav-label">HMOs &amp; Insurances</span></Link></div></div> : null}
        </section>

        {items.slice(2).map((item) => {
          const isActive = currentPath === item.href || (item.href !== "/" && currentPath.startsWith(item.href));
          return <Link key={item.href} href={item.href} onClick={onClose} className={isActive ? "mobile-link active" : "mobile-link"}><span className="nav-label">{item.label}</span></Link>;
        })}

        {!isAuthenticated && <div className="mobile-auth-links">
          <button type="button" onClick={() => { onOpenAuth("login"); onClose(); }} className="mobile-auth-link">Log In</button>
          <button type="button" onClick={() => { onOpenAuth("register"); onClose(); }} className="mobile-auth-link accent">Register</button>
        </div>}
      </div>
    </div>
  );
}
