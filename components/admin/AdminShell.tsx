"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

type Props = {
  title: string;
  adminOnly?: boolean;
  patientAccessOnly?: boolean;
  children: React.ReactNode;
};

export function AdminShell({ title, children, adminOnly = false, patientAccessOnly = false }: Props) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [userRole, setUserRole] = useState<string>();
  const [userName, setUserName] = useState<string>();
  const [avatarUrl, setAvatarUrl] = useState<string>();
  const [checking, setChecking] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [authCheckError, setAuthCheckError] = useState("");

  useEffect(() => {
    const client = supabase;
    if (!client) {
      router.replace("/login");
      setChecking(false);
      return;
    }
    let active = true;
    const checkAccess = async () => {
      try {
        // getSession is local and returns null for a normal signed-out visit.
        // Avoid getUser's expected AuthSessionMissingError in that state.
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (!active) return;
        if (sessionError) {
          if (sessionError.name === "AuthSessionMissingError") {
            setChecking(false);
            router.replace("/login");
            return;
          }
          console.error("[AdminShell] Could not restore the auth session", {
            operation: "auth.getSession",
            name: sessionError.name,
            code: sessionError.code,
            message: sessionError.message,
            status: sessionError.status,
          });
          setChecking(false);
          if (sessionError.name === "AuthRetryableFetchError" || /network|fetch|timeout/i.test(sessionError.message)) {
            setAuthCheckError("We couldn't reach the authentication service. Check your connection and retry.");
          } else router.replace("/login");
          return;
        }
        if (!session) {
          setChecking(false);
          router.replace("/login");
          return;
        }
        const { data, error: authError } = await client.auth.getUser();
        if (!active) return;
        if (authError) {
          if (authError.name !== "AuthSessionMissingError") {
            console.error("[AdminShell] Could not validate the authenticated user", {
              operation: "auth.getUser",
              name: authError.name,
              code: authError.code,
              message: authError.message,
              status: authError.status,
            });
          }
          setChecking(false);
          if (authError.name === "AuthRetryableFetchError" || /network|fetch|timeout/i.test(authError.message)) {
            setAuthCheckError("We couldn't reach the authentication service. Check your connection and retry.");
          } else router.replace("/login");
          return;
        }
        if (!data.user) {
          setChecking(false);
          router.replace("/login");
          return;
        }
        const user = data.user;
        const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (!active) return;
        const role = String(profile?.role ?? "").trim().toUpperCase();
        let allowed = (adminOnly ? ["ADMIN", "SUPER_ADMIN"] : ["ADMIN", "SUPER_ADMIN", "INVENTORY_MANAGER", "SALES_STAFF"]).includes(role);
        let shellRole = role;
        if (patientAccessOnly && !["ADMIN", "SUPER_ADMIN"].includes(role)) {
          const areas = ["care_management", "admissions", "billing", "inventory", "clinical_author", "clinical_release", "lab_author", "lab_release"];
          const permissions = await Promise.all(areas.map((area) => client.rpc("can_manage_patient_area", { p_area: area })));
          allowed = permissions.some((permission) => !permission.error && permission.data === true);
          if (allowed) shellRole = "PATIENT_STAFF";
        } else if (patientAccessOnly) allowed = true;
        if (!allowed) {
          setAccessDenied(true);
          router.replace("/");
        } else {
          setUserEmail(user.email ?? undefined);
          setUserRole(shellRole);
          const metadata = user.user_metadata ?? {};
          const { data: identity } = await client.from("profiles").select("first_name,middle_name,last_name,suffix").eq("id", user.id).maybeSingle();
          if (!active) return;
          const profileName = identity ? [identity.first_name, identity.middle_name, identity.last_name, identity.suffix].filter(Boolean).join(" ") : "";
          setUserName(profileName || (typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : undefined));
          setAvatarUrl(typeof metadata.avatar_url === "string" ? metadata.avatar_url : undefined);
        }
        setChecking(false);
      } catch (error) {
        if (!active) return;
        const value = error && typeof error === "object" ? error as { name?: string; code?: string; message?: string; status?: number } : null;
        if (value?.name !== "AuthSessionMissingError") {
          console.error("[AdminShell] Unexpected access check failure", {
            operation: "admin access guard",
            name: value?.name,
            code: value?.code,
            message: value?.message ?? String(error),
            status: value?.status,
          });
        }
        setChecking(false);
        if (value?.name === "AuthRetryableFetchError" || /network|fetch|timeout/i.test(value?.message ?? "")) {
          setAuthCheckError("We couldn't reach the authentication service. Check your connection and retry.");
        } else router.replace("/login");
      }
    };
    void checkAccess();
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      queueMicrotask(() => {
        if (!active) return;
        if (event === "SIGNED_OUT" || !session) {
          setUserEmail(undefined);
          setUserRole(undefined);
          setUserName(undefined);
          setAvatarUrl(undefined);
          router.replace("/login");
        } else if (event === "SIGNED_IN") {
          setAuthCheckError("");
          setChecking(true);
          void checkAccess();
        }
      });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [router, adminOnly, patientAccessOnly]);

  if (checking) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", fontFamily: "inherit", color: "var(--muted)", background: "var(--bg)" }}>
        Checking authentication…
      </div>
    );
  }

  if (authCheckError) {
    return <div role="alert" style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24, color: "var(--muted)", background: "var(--bg)" }}>
      <div><p>{authCheckError}</p><button type="button" onClick={() => window.location.reload()}>Retry</button></div>
    </div>;
  }

  if (accessDenied) return null;

  return (
    <div className={`ad-root ad-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <div
        className={`ad-sidebar-overlay${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <AdminSidebar
        role={userRole}
        userName={userName ?? userEmail?.split("@")[0] ?? "Administrator"}
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
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
