"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";

type IconName = "dashboard" | "inventory" | "orders" | "customers" | "staff" | "doctors" | "suppliers" | "careers" | "services" | "messages" | "settings" | "website" | "logout";
type NavItem = { href: string; label: string; icon: IconName; badge?: number };
const nav: { section: string; items: NavItem[] }[] = [
  { section: "Main", items: [
    { href: "/admin", label: "Dashboard", icon: "dashboard" },
    { href: "/admin/inventory", label: "Inventory", icon: "inventory" },
    { href: "/admin/orders", label: "Orders", icon: "orders", badge: 3 },
  ] },
  { section: "People", items: [
    { href: "/admin/customers", label: "Patients", icon: "customers" },
    { href: "/admin/staff", label: "Staff", icon: "staff" },
    { href: "/admin/doctors", label: "Doctors", icon: "doctors" },
  ] },
  { section: "Operations", items: [
    { href: "/admin/suppliers", label: "Suppliers", icon: "suppliers" },
    { href: "/admin/careers", label: "Careers", icon: "careers" },
    { href: "/admin/services", label: "Services", icon: "services" },
  ] },
  { section: "System", items: [
    { href: "/admin/messages", label: "Messages", icon: "messages", badge: 2 },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ] },
];

type Props = { isOpen?: boolean; onClose?: () => void; role?: string };

export function AdminSidebar({ isOpen, onClose, role }: Props) {
  const pathname = usePathname();
  const visibleGroups = nav.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const elevated = ["ADMIN", "SUPER_ADMIN"].includes(role ?? "");
      if (item.href === "/admin") return elevated;
      if (["/admin/staff", "/admin/doctors", "/admin/settings", "/admin/careers", "/admin/services"].includes(item.href)) return elevated;
      if (["/admin/inventory", "/admin/suppliers"].includes(item.href)) return role !== "SALES_STAFF";
      if (["/admin/orders", "/admin/customers"].includes(item.href)) return role !== "INVENTORY_MANAGER";
      return true;
    }),
  })).filter((group) => group.items.length > 0);
  const isActive = (href: string) => href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  const handleLogout = async () => { await supabase?.auth.signOut(); window.location.href = "/"; };

  return <aside className={`ad-sidebar${isOpen ? " open" : ""}`}>
    <Link href="/admin" className="ad-sidebar-logo" aria-label="MediWell Admin Dashboard">
      <span className="ad-sidebar-logo-icon" aria-hidden="true"><Icon name="services" /></span>
      <span className="ad-sidebar-logo-text"><strong>MediWell</strong><small>Admin Panel</small></span>
    </Link>
    <nav className="ad-nav" aria-label="Admin navigation">
      {visibleGroups.map((group) => <div key={group.section}>
        <div className="ad-nav-section">{group.section}</div>
        {group.items.map((item) => <Link key={item.href} href={item.href} className={`ad-nav-link${isActive(item.href) ? " active" : ""}`} onClick={onClose}>
          <Icon name={item.icon} /><span className="ad-nav-label">{item.label}</span>
          {item.badge ? <span className="ad-nav-badge">{item.badge}</span> : null}
        </Link>)}
      </div>)}
    </nav>
    <div className="ad-sidebar-footer">
      <Link href="/" className="ad-nav-link" style={{ marginBottom: 4 }} onClick={onClose}><Icon name="website" /><span className="ad-nav-label">View Website</span></Link>
      <button type="button" className="ad-nav-link" onClick={handleLogout}><Icon name="logout" /><span className="ad-nav-label">Logout</span></button>
    </div>
  </aside>;
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
    inventory: <><path d="M3 7h18v13H3z" /><path d="M5 7V4h14v3M8 11v5m4-5v5m4-5v5" /></>,
    orders: <><circle cx="9" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2 3h2l2.6 12.2a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L22 8H5" /></>,
    customers: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6m3-3h-6" /></>,
    staff: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M19 8v6m-3-3h6" /></>,
    doctors: <><path d="M8 2v4m8-4v4M4 10h16M6 4h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" /><path d="M12 13v6m-3-3h6" /></>,
    suppliers: <><path d="M3 7h11v11H3zM14 11h4l3 3v4h-7z" /><circle cx="7.5" cy="19" r="1.5" /><circle cx="17.5" cy="19" r="1.5" /><path d="M5 10h5m-5 3h5" /></>,
    careers: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2" /></>,
    services: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="M12 8v8m-4-4h8" /></>,
    messages: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1A7 7 0 0 1 7.5 13l-1.8-.3V9.9l1.8-.3a7 7 0 0 1 .7-1.7L6.8 6.5l1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.4a7 7 0 0 1 .7 1.7l1.8.3v2.8l-1.8.3a7 7 0 0 1-.7 1.7Z" /></>,
    website: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  };
  return <svg className="ad-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
