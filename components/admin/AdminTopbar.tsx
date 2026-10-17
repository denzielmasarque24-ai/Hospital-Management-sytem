"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, ChevronDown, CircleUserRound, KeyRound, LogOut, Moon, Settings2, ShieldCheck, Sun, UserRound, Laptop } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type Theme = "light" | "dark" | "system";
type Props = {
  title: string;
  onMenuClick: () => void;
  userEmail?: string;
  userRole?: string;
  userName?: string;
  avatarUrl?: string;
};

const themes: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Laptop },
];

export function AdminTopbar({ title, onMenuClick, userEmail, userRole, userName, avatarUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const displayName = userName?.trim() || userEmail?.split("@")[0] || "Administrator";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AD";
  const roleLabel = (userRole ?? "Administrator").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

  useEffect(() => {
    const saved = localStorage.getItem("mediwell-admin-theme");
    const nextTheme = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
    setTheme(nextTheme);
    document.documentElement.dataset.adminTheme = nextTheme;
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const selectTheme = (value: Theme) => {
    setTheme(value);
    localStorage.setItem("mediwell-admin-theme", value);
    document.documentElement.dataset.adminTheme = value;
  };

  const logout = async () => {
    if (!supabase || loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLogoutError("Could not sign out. Please try again.");
      setLoggingOut(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="ad-topbar">
      <button type="button" className="ad-mobile-menu-btn" onClick={onMenuClick} aria-label="Toggle menu">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <div className="ad-topbar-title">{title}</div>
      <div className="ad-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input placeholder="Search..." /></div>
      <div className="ad-topbar-actions">
        <Link href="/admin/settings" className="ad-icon-btn" aria-label="Notification preferences"><Bell size={16}/></Link>
        <div className="ad-profile-menu" ref={menuRef}>
          <button type="button" className="ad-profile-trigger" aria-haspopup="true" aria-expanded={open} aria-controls="admin-profile-dropdown" onClick={() => { setOpen((value) => !value); setLogoutError(""); }}>
            <span className="ad-avatar">{avatarUrl ? <img src={avatarUrl} alt=""/> : initials}</span>
            <span className="ad-topbar-user-info"><span className="ad-topbar-user-name">{displayName}</span><span className="ad-topbar-user-email">{userEmail ?? "Administrator account"}</span></span>
            <ChevronDown className={`ad-profile-chevron${open ? " open" : ""}`} size={15}/>
          </button>
          {open && <div className="ad-profile-dropdown" id="admin-profile-dropdown">
            <div className="ad-profile-dropdown-heading"><strong>{displayName}</strong><span>{userEmail}</span><small><ShieldCheck size={13}/>{roleLabel}</small></div>
            <div className="ad-profile-menu-links">
              <Link href="/admin/profile" onClick={() => setOpen(false)}><CircleUserRound size={17}/><span><strong>My Profile</strong><small>View and edit personal details</small></span></Link>
              <Link href="/admin/profile#security" onClick={() => setOpen(false)}><KeyRound size={17}/><span><strong>Account Settings</strong><small>Email, password, and security</small></span></Link>
              <Link href="/admin/profile#permissions" onClick={() => setOpen(false)}><UserRound size={17}/><span><strong>Administrator Profile</strong><small>Role and permissions</small></span></Link>
              <Link href="/admin/settings" onClick={() => setOpen(false)}><Bell size={17}/><span><strong>Notifications</strong><small>Notification preferences</small></span></Link>
            </div>
            <div className="ad-profile-theme"><div className="ad-profile-theme-label"><Settings2 size={16}/>Theme</div><div className="ad-profile-theme-options">{themes.map(({ value, label, Icon }) => <button type="button" key={value} className={theme === value ? "selected" : ""} aria-pressed={theme === value} onClick={() => selectTheme(value)}><Icon size={14}/>{label}{theme === value && <Check size={13}/>}</button>)}</div></div>
            {logoutError && <p className="ad-profile-menu-error" role="alert">{logoutError}</p>}
            <button type="button" className="ad-profile-logout" onClick={() => void logout()} disabled={loggingOut}><LogOut size={17}/>{loggingOut ? "Signing out…" : "Sign out securely"}</button>
          </div>}
        </div>
      </div>
    </header>
  );
}
