"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

type Props = {
  title: string;
  children: React.ReactNode;
};

export function AdminShell({ title, children }: Props) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [userRole, setUserRole] = useState<string>();
  const [userName, setUserName] = useState<string>();
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [checking, setChecking] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      router.replace("/login");
      return;
    }
    client.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace("/login");
      } else {
        const { data: profile } = await client.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
        const role = String(profile?.role ?? "").trim().toUpperCase();
        const allowed = ["ADMIN", "SUPER_ADMIN", "INVENTORY_MANAGER", "SALES_STAFF"].includes(role);
        if (!allowed) {
          setAccessDenied(true);
          router.replace("/");
        } else {
          setUserEmail(data.user.email ?? undefined);
          setUserRole(role);
          const metadata = data.user.user_metadata ?? {};
          setUserName(typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : undefined);
          setAvatarUrl(typeof metadata.avatar_url === "string" ? metadata.avatar_url : undefined);
        }
        setChecking(false);
      }
    });
  }, [router]);

  if (checking) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "Inter, sans-serif", color: "#6b7280" }}>
        Checking authentication…
      </div>
    );
  }

  if (accessDenied) return null;

  return (
    <div className="ad-root ad-shell">
      <div
        className={`ad-sidebar-overlay${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <AdminSidebar
        role={userRole}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="ad-main">
        <AdminTopbar
          title={title}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          userEmail={userEmail}
          userRole={userRole}
          userName={userName}
          avatarUrl={avatarUrl}
        />
        <main className="ad-content">{children}</main>
      </div>
    </div>
  );
}
