"use client";

import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BedDouble,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Pill,
  ReceiptText,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthModal } from "@/components/auth/AuthModal";
import { useChatNotifications } from "@/lib/hooks/useChatNotifications";
import { supabase } from "@/lib/supabase/client";

import { MobileMenu } from "./MobileMenu";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/products", label: "Products" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Message" },
];

export function Header({ initialAuthOpen = false, authMessage }: { initialAuthOpen?: boolean; authMessage?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [patientGuideOpen, setPatientGuideOpen] = useState(false);
  const [expandedServicesGroup, setExpandedServicesGroup] = useState<string | null>(null);
  const [mobileServicesExpanded, setMobileServicesExpanded] = useState(false);
  const [authOpen, setAuthOpen] = useState(initialAuthOpen);
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState("");
  const [userRoleError, setUserRoleError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const servicesRef = useRef<HTMLDivElement>(null);
  const patientGuideRef = useRef<HTMLDivElement>(null);
  const roleRequestRef = useRef(0);
  const notificationAudience = userRole === "PATIENT"
    ? "patient"
    : ["ADMIN", "SUPER_ADMIN"].includes(userRole) ? "admin" : null;
  const chatNotifications = useChatNotifications(notificationAudience, user?.id);
  const chatRelativeTime = (value: string) => new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    -Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)), "minute",
  );

  useEffect(() => {
    const openLogin = () => {
      setAuthMode("login");
      setAuthOpen(true);
    };

    window.addEventListener("mediwell:open-login", openLogin);
    return () => window.removeEventListener("mediwell:open-login", openLogin);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const syncUser = async (nextUser: User | null) => {
      const requestId = ++roleRequestRef.current;
      setUser(nextUser);
      setAccountOpen(false);
      setUserRole("");
      setUserRoleError("");
      if (!nextUser) {
        return;
      }
      const { data, error } = await client.from("profiles").select("role").eq("id", nextUser.id).maybeSingle();
      if (active && requestId === roleRequestRef.current) {
        setUserRole(String(data?.role ?? "").trim().toUpperCase());
        if (error) {
          console.error("[Header] Could not verify notification account role", {
            operation: "profiles.select(role)",
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
          setUserRoleError(error.message);
        }
      }
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (active) void syncUser(session?.user ?? null);
      });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!accountOpen && !notificationsOpen && !mobileOpen && !servicesOpen && !patientGuideOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
      if (!servicesRef.current?.contains(event.target as Node)) {
        setServicesOpen(false);
        setExpandedServicesGroup(null);
      }
      if (!patientGuideRef.current?.contains(event.target as Node)) setPatientGuideOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setNotificationsOpen(false);
        setMobileOpen(false);
        setMobileServicesExpanded(false);
        setServicesOpen(false);
        setPatientGuideOpen(false);
        setExpandedServicesGroup(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen, notificationsOpen, mobileOpen, servicesOpen, patientGuideOpen]);

  useEffect(() => { setAccountOpen(false); setNotificationsOpen(false); setMobileOpen(false); setServicesOpen(false); setPatientGuideOpen(false); setExpandedServicesGroup(null); setMobileServicesExpanded(false); }, [pathname]);

  const toggleServicesGroup = (group: string) => setExpandedServicesGroup((current) => current === group ? null : group);
  const servicesMenu: { label: string; href: string; children?: { href: string; label: string }[] }[] = [
    { label: "Services & Facilities", href: "/services" },
    { label: "Clinical Departments", href: "/clinical-departments" },
    { label: "Our Doctors", href: "/doctors" },
    { label: "Patient Room Rates", href: "/room-rates" },
    { label: "Offers & Price Lists", href: "/health-packages", children: [
      { href: "/health-packages", label: "Health Packages" },
      { href: "/lab-tests", label: "Laboratory Tests & Prices" },
      { href: "/products", label: "Pharmacy Products" },
    ] },
  ];

  const isAdmin = ["ADMIN", "SUPER_ADMIN", "INVENTORY_MANAGER", "SALES_STAFF"].includes(userRole);
  const patientAccountItems = [
    { href: "/patient/profile", label: "My Profile", Icon: UserRound },
    { href: "/patient/appointments", label: "My Appointments", Icon: CalendarDays },
    { href: "/patient/medical-history", label: "My Medical History", Icon: ClipboardList },
    { href: "/patient/assigned-doctor", label: "My Assigned Doctor", Icon: Stethoscope },
    { href: "/patient/admissions", label: "My Admissions", Icon: ClipboardList },
    { href: "/patient/room-information", label: "My Room Information", Icon: BedDouble },
    { href: "/patient/billing", label: "My Bills & Payments", Icon: ReceiptText },
    { href: "/patient/medical-supplies", label: "Medical Supplies & Charges", Icon: Pill },
    { label: "Logout", Icon: LogOut, action: "logout" as const },
  ];
  const adminAccountItems = [
    { href: "/admin", label: "My Dashboard", Icon: LayoutDashboard },
    { href: "/admin/profile", label: "My Profile", Icon: UserRound },
  ];
  const signOut = async () => {
    if (!supabase) return;
    setLogoutError("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLogoutError("Logout could not be completed. Please try again.");
      return;
    }
    setAccountOpen(false);
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo" aria-label="MedWell Medical Hospital home">
          <Image src="/images/logo.png" width={2172} height={724} alt="" className="logo-image" priority />
        </Link>

        <nav className="nav" aria-label="Main navigation">
          {navItems.slice(0, 2).map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link key={item.href} href={item.href} className={isActive ? "active" : ""}><span className="nav-label">{item.label}</span></Link>
            );
          })}
          <div
            className={`nav-services${servicesOpen ? " is-open" : ""}`}
            ref={servicesRef}
            onMouseEnter={() => { setServicesOpen(true); }}
            onMouseLeave={() => { setServicesOpen(false); setExpandedServicesGroup(null); }}
            onFocus={() => setServicesOpen(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setServicesOpen(false);
                setExpandedServicesGroup(null);
              }
            }}
          >
            <button type="button" className={`nav-services-trigger${servicesOpen || pathname.startsWith("/services") || pathname.startsWith("/clinical-departments") || pathname.startsWith("/room-rates") ? " active" : ""}`} aria-haspopup="true" aria-expanded={servicesOpen} aria-controls="services-dropdown" onClick={() => { if (window.matchMedia("(hover: none)").matches) { setServicesOpen((open) => !open); setExpandedServicesGroup(null); } else setServicesOpen(true); }}>
              <span className="nav-label">Our Services</span> <ChevronDown size={15} aria-hidden="true" className={servicesOpen ? "is-open" : ""}/>
            </button>
            <div className="services-dropdown" id="services-dropdown" aria-label="Our Services links" aria-hidden={!servicesOpen}>
              {servicesMenu.map((item) => <div className={`services-dropdown-item${item.children ? " has-children offers-price-menu" : ""}${item.children && (expandedServicesGroup === item.label || item.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`))) ? " is-active" : ""}`} key={item.label} onMouseEnter={() => { if (item.children) setExpandedServicesGroup(item.label); }} onMouseLeave={() => { if (item.children) setExpandedServicesGroup((current) => current === item.label ? null : current); }}>
                <Link href={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setServicesOpen(false)}><span className="nav-label">{item.label}</span></Link>
                {item.children ? <>
                  <button type="button" className="services-submenu-toggle" aria-label={`${expandedServicesGroup === item.label ? "Collapse" : "Expand"} ${item.label}`} aria-expanded={expandedServicesGroup === item.label} aria-controls={`submenu-${item.label.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}`} onClick={() => toggleServicesGroup(item.label)}><ChevronDown size={16} aria-hidden="true"/></button>
                  {expandedServicesGroup === item.label ? <div className="services-submenu" id={`submenu-${item.label.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}`}>
                    {item.children.map((child) => <Link href={child.href} key={child.href} aria-current={pathname === child.href ? "page" : undefined} onClick={() => setServicesOpen(false)}><span className="nav-label">{child.label}</span></Link>)}
                  </div> : null}
                </> : null}
              </div>)}
            </div>
          </div>
          <div className={`nav-services nav-patient-guide${patientGuideOpen ? " is-open" : ""}`} ref={patientGuideRef} onMouseEnter={() => setPatientGuideOpen(true)} onMouseLeave={() => setPatientGuideOpen(false)} onFocus={() => setPatientGuideOpen(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPatientGuideOpen(false); }}>
            <button type="button" className={`nav-services-trigger${patientGuideOpen || pathname.startsWith("/patient-guide") ? " active" : ""}`} aria-haspopup="true" aria-expanded={patientGuideOpen} aria-controls="patient-guide-dropdown" onClick={() => { if (window.matchMedia("(hover: none)").matches) setPatientGuideOpen((open) => !open); else setPatientGuideOpen(true); }}>
              <span className="nav-label">Patient Guide</span> <ChevronDown size={15} aria-hidden="true" className={patientGuideOpen ? "is-open" : ""} />
            </button>
            <div className="services-dropdown patient-guide-dropdown" id="patient-guide-dropdown" aria-label="Patient Guide links" aria-hidden={!patientGuideOpen}>
              <Link href="/patient-guide/admission" aria-current={pathname === "/patient-guide/admission" ? "page" : undefined} onClick={() => setPatientGuideOpen(false)}><span className="nav-label">How to Get Admitted</span></Link>
              <Link href="/patient-guide/hmos-insurances" aria-current={pathname === "/patient-guide/hmos-insurances" ? "page" : undefined} onClick={() => setPatientGuideOpen(false)}><span className="nav-label">HMOs &amp; Insurances</span></Link>
            </div>
          </div>
          {navItems.slice(2).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={isActive ? "active" : ""}><span className="nav-label">{item.label}</span></Link>;
          })}
        </nav>

        <div className="header-right">
          <div className="header-auth-links">
            {user ? (
              <>
                <div className="header-notifications" ref={notificationsRef}>
                  <button type="button" className="header-notifications-trigger" aria-label={`Notifications${chatNotifications.unreadCount ? `, ${chatNotifications.unreadCount} unread` : ""}`} title="Notifications" aria-haspopup="dialog" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((open) => { const next = !open; if (next) void chatNotifications.refresh(); return next; }); setAccountOpen(false); }}>
                    <Bell size={21} strokeWidth={1.9} aria-hidden="true" />
                    {chatNotifications.unreadCount > 0 && <span className="header-notification-count">{chatNotifications.unreadCount > 99 ? "99+" : chatNotifications.unreadCount}</span>}
                  </button>
                  {notificationsOpen ? <section className="header-notifications-panel" aria-label="Notifications" role="dialog">
                    <div className="header-notifications-heading"><strong>Notifications</strong><span>{chatNotifications.loading ? "Checking for updates" : `${chatNotifications.unreadCount} unread`}</span></div>
                    {(chatNotifications.error || userRoleError) && <p className="header-notification-error" role="alert">Notifications couldn&apos;t be loaded: {chatNotifications.error || userRoleError}</p>}
                    {chatNotifications.error && <button type="button" className="header-notification-retry" onClick={() => void chatNotifications.refresh()} disabled={chatNotifications.loading}>{chatNotifications.loading ? "Retrying…" : "Retry"}</button>}
                    {chatNotifications.realtimeNotice && <p className="header-notification-status" role="status">{chatNotifications.realtimeNotice}</p>}
                    {chatNotifications.loading && !chatNotifications.notifications.length
                      ? <p className="header-notifications-empty" role="status">Loading notifications...</p>
                      : chatNotifications.notifications.length
                        ? <div className="header-notifications-list">{chatNotifications.notifications.map((notification) => <Link
                          key={notification.id}
                          className={`header-notification-item${notification.is_read ? "" : " unread"}`}
                          href={`${notificationAudience === "admin" ? "/admin/messages" : "/contact"}?conversation=${encodeURIComponent(notification.conversation_id)}`}
                          onClick={() => setNotificationsOpen(false)}
                        ><span className="header-notification-copy"><strong>{notification.sender_name}</strong><span>{notification.preview}</span><time>{chatRelativeTime(notification.created_at)}</time></span>{!notification.is_read && <i aria-label="Unread"/>}</Link>)}</div>
                        : !chatNotifications.error && !userRoleError && !chatNotifications.loading
                          ? <p className="header-notifications-empty">{!notificationAudience ? userRole ? "Chat notifications are not available for this account." : "Checking account access…" : "No notifications yet."}</p>
                          : null}
                  </section> : null}
                </div>
                <div className="header-account" ref={accountRef}>
                <button type="button" className="header-account-trigger" aria-label="My Account" title="My Account" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => { setAccountOpen((open) => !open); setNotificationsOpen(false); }}>
                  <span className="header-account-label">My Account</span><ChevronDown size={14} aria-hidden="true" />
                </button>
                {accountOpen ? <nav className="header-account-menu" aria-label="My Account menu">
                  {userRole === "PATIENT" ? patientAccountItems.map((item) => {
                    const { Icon, label } = item;
                    return "action" in item
                      ? <button type="button" key={label} onClick={() => void signOut()}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></button>
                      : <Link href={item.href} key={item.href} className={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "active" : undefined} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setAccountOpen(false)}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></Link>;
                  }) : isAdmin ? <>{adminAccountItems.map(({ href, label, Icon }) => <Link href={href} key={href} onClick={() => setAccountOpen(false)}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></Link>)}<button type="button" onClick={() => void signOut()}><LogOut size={17} strokeWidth={1.8} aria-hidden="true" /><span>Logout</span></button></> : <><p className="header-account-verifying">{userRole ? "No account links are available for this role." : "Verifying account accessâ€¦"}</p><button type="button" onClick={() => void signOut()}><LogOut size={17} strokeWidth={1.8} aria-hidden="true" /><span>Logout</span></button></>}
                  {logoutError ? <p className="header-account-error" role="alert">{logoutError}</p> : null}
                </nav> : null}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="header-auth-link header-login"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthOpen(true);
                  }}
                >
                  Log In
                </button>
                <button type="button" className="header-auth-link header-register" onClick={() => {
                  setAuthMode("register");
                  setAuthOpen(true);
                }}>
                  Register
                </button>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          className="mobile-menu"
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-controls="mobile-navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X size={23} aria-hidden="true" /> : <Menu size={23} aria-hidden="true" />}
        </button>
      </div>

      <MobileMenu
        items={navItems}
        currentPath={pathname}
        servicesMenu={servicesMenu}
        expandedServicesGroup={expandedServicesGroup}
        onToggleServicesGroup={toggleServicesGroup}
        mobileServicesExpanded={mobileServicesExpanded}
        onToggleMobileServices={() => setMobileServicesExpanded((open) => !open)}
        isOpen={mobileOpen}
        isAuthenticated={Boolean(user)}
        onClose={() => setMobileOpen(false)}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setAuthOpen(true);
        }}
      />

      <AuthModal
        open={authOpen}
        mode={authMode}
        message={authMessage}
        onClose={(reason?: string) => {
          setAuthOpen(false);
          if (initialAuthOpen && reason !== "authenticated") router.replace("/");
        }}
        onModeChange={setAuthMode}
      />
    </header>
  );
}
