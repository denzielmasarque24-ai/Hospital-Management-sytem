"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, CircleUserRound, KeyRound, LogOut, Settings2, ShieldCheck, UserRound, Menu, House, MessageCircle, CalendarDays, PackageCheck, CheckCheck, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAdminTheme } from "@/lib/admin/useAdminTheme";
import { useChatNotifications } from "@/lib/hooks/useChatNotifications";


type Props = {
  title: string;
  onMenuClick: () => void;
  userEmail?: string;
  userRole?: string;
  userName?: string;
  avatarUrl?: string;
};

type AdminNotification = { id: string; type: string; title: string; body: string; related_conversation_id: string | null; is_read: boolean; created_at: string };
type NotificationError = { name?: string; code?: string; message?: string; details?: string; hint?: string; status?: number; statusCode?: number };
const notificationErrorDetails = (error: unknown) => {
  if (!error || typeof error !== "object") return { message: String(error) };
  const value = error as NotificationError;
  return { name: value.name, code: value.code, message: value.message, details: value.details, hint: value.hint, status: value.status ?? value.statusCode };
};
const notificationErrorText = (error: unknown) => {
  const value = notificationErrorDetails(error);
  return [value.code ? `(${value.code})` : "", value.message || "Unknown Supabase error", value.details, value.hint ? `Hint: ${value.hint}` : ""].filter(Boolean).join(" ");
};

const notificationIcon = (type: string) => type.includes("message") || type.includes("conversation") ? MessageCircle : type.includes("appointment") ? CalendarDays : PackageCheck;
const notificationHref = (notification: AdminNotification) => notification.related_conversation_id
  ? `/admin/messages?conversation=${encodeURIComponent(notification.related_conversation_id)}`
  : notification.type.includes("appointment") ? "/admin/appointments" : notification.type.includes("order") ? "/admin/orders" : "/admin";
const notificationTime = (value: string) => new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
  -Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000 / 60)), "minute",
);
const isAdminRole = (value: unknown) => ["admin", "super_admin"].includes(String(value ?? "").trim().toLowerCase());

export function AdminTopbar({ title, onMenuClick, userEmail, userRole, userName, avatarUrl }: Props) {
  const [open, setOpen] = useState(false);
  useAdminTheme();
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<"all" | "unread">("all");
  const [notificationError, setNotificationError] = useState("");
  const [notificationLoading, setNotificationLoading] = useState(true);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const displayName = userName?.trim() || userEmail?.split("@")[0] || "Administrator";
  const initials = displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AD";
  const roleLabel = (userRole ?? "Administrator").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const [authenticatedUserId, setAuthenticatedUserId] = useState("");
  const chatNotifications = useChatNotifications("admin", authenticatedUserId || undefined);
  const chatItems = chatNotifications.notifications;
  const visibleAdminNotifications = notifications.filter((item) => !item.related_conversation_id && !["new_conversation", "patient_message"].includes(item.type.toLowerCase()));
  const combinedUnreadCount = unreadNotificationCount + chatNotifications.unreadCount;
  const combinedNotificationRows = [
    ...chatItems.map((item) => ({ kind: "chat" as const, ...item })),
    ...visibleAdminNotifications.map((item) => ({ kind: "admin" as const, ...item })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const filteredNotificationRows = notificationFilter === "unread" ? combinedNotificationRows.filter((item) => !item.is_read) : combinedNotificationRows;

  useEffect(() => {
    if (!supabase) {
      setNotificationError("Notifications are unavailable because Supabase is not configured.");
      setNotificationLoading(false);
      return;
    }
    const client = supabase;
    let active = true;
    const loadingKeys = new Set<string>();
    let activeUserId = "";
    let authGeneration = 0;
    let channel: ReturnType<typeof client.channel> | null = null;
    let refreshTimer: number | null = null;
    const clearNotifications = () => {
      setAuthenticatedUserId("");
      setNotifications([]);
      setUnreadNotificationCount(0);
      setNotificationError("");
      setNotificationLoading(false);
    };
    const stopRealtime = () => {
      if (refreshTimer !== null) window.clearInterval(refreshTimer);
      refreshTimer = null;
      if (channel) void client.removeChannel(channel);
      channel = null;
    };
    const load = async (userId: string, generation: number) => {
      const requestKey = `${userId}:${generation}`;
      if (loadingKeys.has(requestKey)) return;
      loadingKeys.add(requestKey);
      if (active) setNotificationLoading(true);
      try {
        // getSession is a local state check: without a stored session, don't call
        // getUser or issue authenticated notification requests.
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (!active || generation !== authGeneration) return;
        if (sessionError) {
          if (sessionError.name === "AuthSessionMissingError") {
            clearNotifications();
            return;
          }
          console.error("[AdminTopbar] Could not read the auth session", { operation: "auth.getSession", ...notificationErrorDetails(sessionError) });
          setNotificationError(notificationErrorText(sessionError));
          return;
        }
        if (!session || session.user.id !== userId) {
          clearNotifications();
          return;
        }
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (!active || generation !== authGeneration) return;
        if (authError?.name === "AuthSessionMissingError" || (!authError && !user)) {
          clearNotifications();
          return;
        }
        if (authError) {
          console.error("[AdminTopbar] Notification authentication check failed", { operation: "auth.getUser", ...notificationErrorDetails(authError) });
          setNotificationError(notificationErrorText(authError));
          return;
        }
        if (!user || user.id !== userId) {
          clearNotifications();
          return;
        }
        const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (!active || generation !== authGeneration) return;
        if (profileError) {
          console.error("[AdminTopbar] Notification profile lookup failed", { operation: "profiles.select(role)", userId: user.id, ...notificationErrorDetails(profileError) });
          setNotificationError(profileError.code === "42501" ? "This account cannot read its administrator profile." : `Administrator profile lookup failed: ${notificationErrorText(profileError)}`);
          return;
        }
        if (!profile) { setNotificationError("No profile is linked to this authenticated account."); return; }
        if (!isAdminRole(profile.role)) { setNotificationError(`This database role (${profile.role || "empty"}) cannot view administrator notifications.`); return; }
        const { data, error } = await client.from("admin_notifications").select("id, type, title, body, related_conversation_id, is_read, created_at").order("created_at", { ascending: false }).limit(50);
        if (!active || generation !== authGeneration) return;
        if (error) { console.error("[AdminTopbar] Notification query failed", { operation: "admin_notifications.select", ...notificationErrorDetails(error) }); setNotificationError(notificationErrorText(error)); return; }
        const { count, error: countError } = await client.from("admin_notifications").select("id", { count: "exact", head: true }).eq("is_read", false).is("related_conversation_id", null);
        if (!active || generation !== authGeneration) return;
        if (countError) { console.error("[AdminTopbar] Notification count failed", { operation: "admin_notifications.count", ...notificationErrorDetails(countError) }); setNotificationError(notificationErrorText(countError)); return; }
        setAuthenticatedUserId(user.id);
        setNotificationError(""); setNotifications((data ?? []) as AdminNotification[]); setUnreadNotificationCount(count ?? 0);
        if (!channel) {
          channel = client.channel(`admin-notifications-${user.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications", filter: `recipient_id=eq.${user.id}` }, () => { void load(user.id, generation); })
            .subscribe();
        }
        if (refreshTimer === null) refreshTimer = window.setInterval(() => { void load(user.id, generation); }, 60000);
      } catch (error) {
        const details = notificationErrorDetails(error);
        if (details.name !== "AuthSessionMissingError") {
          console.error("[AdminTopbar] Unexpected notification load failure", { operation: "admin_notifications.load", ...details });
          if (active) setNotificationError(notificationErrorText(error));
        } else {
          clearNotifications();
        }
      } finally {
        loadingKeys.delete(requestKey);
        if (active && generation === authGeneration) setNotificationLoading(false);
      }
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      // Defer Supabase calls until after the auth callback releases its internal lock.
      queueMicrotask(() => {
        if (!active) return;
        if (!session) {
          if (activeUserId) {
            activeUserId = "";
            authGeneration += 1;
            stopRealtime();
            clearNotifications();
          } else if (event === "INITIAL_SESSION") {
            setNotificationLoading(false);
          }
          return;
        }
        const nextUserId = session.user.id;
        if (nextUserId !== activeUserId) {
          activeUserId = nextUserId;
          authGeneration += 1;
          stopRealtime();
          clearNotifications();
          setNotificationLoading(true);
          setAuthenticatedUserId(nextUserId);
        } else if (event === "TOKEN_REFRESHED") {
          return;
        }
        void load(nextUserId, authGeneration);
      });
    });
    return () => {
      active = false;
      authGeneration += 1;
      subscription.unsubscribe();
      stopRealtime();
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) setNotificationsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setNotificationsOpen(false); };
    document.addEventListener("pointerdown", onPointerDown); document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const markNotificationRead = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.from("admin_notifications").update({ is_read: true }).eq("id", id).eq("is_read", false);
    if (error) { console.error("[AdminTopbar] Could not mark notification read", { operation: "admin_notifications.update(is_read)", ...notificationErrorDetails(error) }); setNotificationError(notificationErrorText(error)); return; }
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item)); setUnreadNotificationCount((current) => Math.max(0, current - 1));
  };
  const markAllNotificationsRead = async () => {
    if (!supabase) return;
    if (!unreadNotificationCount) return;
    const { error } = await supabase.from("admin_notifications").update({ is_read: true }).eq("is_read", false);
    if (error) { console.error("[AdminTopbar] Could not mark notifications read", { operation: "admin_notifications.update(all is_read)", ...notificationErrorDetails(error) }); setNotificationError(notificationErrorText(error)); return; }
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true }))); setUnreadNotificationCount(0);
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

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
      <button type="button" className="ad-sidebar-toggle ad-sidebar-toggle-mobile" onClick={onMenuClick} aria-label="Open navigation" title="Open navigation">
        <Menu size={19}/>
      </button>
      <div className="ad-topbar-heading">
        <div className="ad-topbar-title">{title}</div>
        <div className="ad-topbar-breadcrumb"><Link href="/admin" aria-label="Home"><House size={12}/></Link><span>Home</span><span aria-hidden="true">/</span><span>Admin</span><span aria-hidden="true">/</span><strong>{title}</strong></div>
      </div>
      <div className="ad-topbar-actions">
        <div className="ad-notifications" ref={notificationsRef}>
          <button type="button" className="ad-icon-btn ad-notifications-trigger" aria-label={`Notifications, ${combinedUnreadCount} unread`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => { const next = !value; if (next) void chatNotifications.refresh(); return next; })}><Bell size={17}/>{combinedUnreadCount > 0 && <span className="ad-notification-count">{combinedUnreadCount > 99 ? "99+" : combinedUnreadCount}</span>}</button>
          {notificationsOpen && <section className="ad-notifications-panel" aria-label="Notifications">
            <header className="ad-notifications-heading"><div><strong>Notifications</strong><span>You have {combinedUnreadCount} unread notifications.</span></div><button type="button" onClick={() => void markAllNotificationsRead()} disabled={!unreadNotificationCount}><CheckCheck size={14}/> Mark all read</button></header>
            <div className="ad-notifications-tabs"><button className={notificationFilter === "all" ? "active" : ""} onClick={() => setNotificationFilter("all")}>All</button><button className={notificationFilter === "unread" ? "active" : ""} onClick={() => setNotificationFilter("unread")}>Unread</button></div>
            {notificationError && <p className="ad-notification-error" role="alert">{notificationError}</p>}
            {chatNotifications.error && <p className="ad-notification-error" role="alert">Chat notifications: {chatNotifications.error}</p>}
            {chatNotifications.error && <button type="button" className="ad-notification-retry" onClick={() => void chatNotifications.refresh()} disabled={chatNotifications.loading}>{chatNotifications.loading ? "Retrying…" : "Retry chat notifications"}</button>}
            {chatNotifications.realtimeNotice && <p className="ad-notification-error" role="status">{chatNotifications.realtimeNotice}</p>}
            <div className="ad-notifications-list">
              {filteredNotificationRows.map((item) => {
                const isChat = item.kind === "chat";
                const href = isChat ? `/admin/messages?conversation=${encodeURIComponent(item.conversation_id)}` : notificationHref(item);
                const label = isChat ? item.sender_name : item.title;
                const body = isChat ? item.preview : item.body;
                const Icon = isChat ? MessageCircle : notificationIcon(item.type);
                return <Link key={`${item.kind}-${item.id}`} href={href} className={`ad-notification-item${item.is_read ? "" : " unread"}`} onClick={() => { setNotificationsOpen(false); if (!isChat && !item.is_read) void markNotificationRead(item.id); }}><span className="ad-notification-icon"><Icon size={16}/></span><span className="ad-notification-copy"><strong>{label}</strong><span>{body}</span><time>{notificationTime(item.created_at)}</time></span>{!item.is_read && <i aria-label="Unread"/>}</Link>;
              })}
              {(notificationLoading || chatNotifications.loading) && !chatItems.length && !visibleAdminNotifications.length ? <p className="ad-notifications-empty">Loading notifications…</p> : !chatNotifications.error && !notificationError && !filteredNotificationRows.length ? <p className="ad-notifications-empty">You're all caught up.</p> : null}
            </div>
            <Link className="ad-notifications-all" href="/admin/notifications" onClick={() => setNotificationsOpen(false)}>View all notifications <ExternalLink size={13}/></Link>
          </section>}
        </div>
        <div className="ad-profile-menu" ref={menuRef}>
          <button type="button" className="ad-profile-trigger" aria-haspopup="true" aria-expanded={open} aria-controls="admin-profile-dropdown" onClick={() => { setOpen((value) => !value); setLogoutError(""); }}>
            <span className="ad-avatar">{avatarUrl ? <img src={avatarUrl} alt=""/> : initials}</span>
            <span className="ad-topbar-user-info"><span className="ad-topbar-user-name">{displayName}</span><span className="ad-topbar-user-email">{userEmail ?? "Administrator account"}</span></span>
            <ChevronDown className={`ad-profile-chevron${open ? " open" : ""}`} size={15}/>
          </button>
          {open && <div className="ad-profile-dropdown" id="admin-profile-dropdown">
            <div className="ad-profile-dropdown-heading"><strong>{displayName}</strong><span>{userEmail}</span><small><ShieldCheck size={13}/>{roleLabel}</small></div>
            <div className="ad-profile-menu-links">
              <Link href="/admin/settings#my-profile" onClick={() => setOpen(false)}><CircleUserRound size={17}/><span><strong>My Profile</strong><small>View and edit personal details</small></span></Link>
              <Link href="/admin/settings#account-settings" onClick={() => setOpen(false)}><KeyRound size={17}/><span><strong>Account Settings</strong><small>Email, password, and security</small></span></Link>
              <Link href="/admin/settings#administrator-profile" onClick={() => setOpen(false)}><UserRound size={17}/><span><strong>Administrator Profile</strong><small>Role and permissions</small></span></Link>
              <Link href="/admin/settings#notifications" onClick={() => setOpen(false)}><Bell size={17}/><span><strong>Notifications</strong><small>Notification preferences</small></span></Link>
            </div>
            <Link className="ad-profile-appearance-link" href="/admin/settings#appearance" onClick={() => setOpen(false)}><Settings2 size={17}/> Appearance / Theme</Link>
            {logoutError && <p className="ad-profile-menu-error" role="alert">{logoutError}</p>}
            <button type="button" className="ad-profile-logout" onClick={() => void logout()} disabled={loggingOut}><LogOut size={17}/>{loggingOut ? "Signing out…" : "Sign out securely"}</button>
          </div>}
        </div>
      </div>
    </header>
  );
}
