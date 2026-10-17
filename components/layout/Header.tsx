"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthModal } from "@/components/auth/AuthModal";
import { supabase } from "@/lib/supabase/client";

import { MobileMenu } from "./MobileMenu";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Our Services" },
  { href: "/products", label: "Products" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Message" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const openLogin = () => {
      setAuthMode("login");
      setAuthOpen(true);
    };

    window.addEventListener("mediwell:open-login", openLogin);
    return () => window.removeEventListener("mediwell:open-login", openLogin);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="header">
      <div className="container header-inner">
        <Link href="/" className="logo" aria-label="MediWell Pharma home">
          <span className="logo-icon">✚</span>
          <span>
            <strong>MediWell</strong>
            <small>PHARMA</small>
          </span>
        </Link>

        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));

            return (
              <Link key={item.href} href={item.href} className={isActive ? "active" : ""}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-right">
          {pathname !== "/contact" ? (
            <div className="phone" aria-label="Support phone number">
              <span className="phone-icon">☎</span>
              <div>
                <strong>+1 234 567 8900</strong>
                <small>24/7 Support</small>
              </div>
            </div>
          ) : null}

          <div className="header-auth-links">
            {user ? (
              <>
                <span className="header-user-email">{user.email}</span>
                <button
                  type="button"
                  className="header-auth-link header-logout"
                  onClick={async () => {
                    await supabase?.auth.signOut();
                    router.replace("/login");
                  }}
                >
                  Log Out
                </button>
              </>
            ) : (
              <button
                type="button"
                className="header-auth-link"
                onClick={() => {
                  setAuthMode("login");
                  setAuthOpen(true);
                }}
              >
                Log In
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          className="mobile-menu"
          aria-label="Toggle navigation menu"
          onClick={() => setMobileOpen((open) => !open)}
        >
          ☰
        </button>
      </div>

      <MobileMenu
        items={navItems}
        currentPath={pathname}
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onOpenAuth={(mode) => {
          setAuthMode(mode);
          setAuthOpen(true);
        }}
      />

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onModeChange={setAuthMode}
      />
    </header>
  );
}
