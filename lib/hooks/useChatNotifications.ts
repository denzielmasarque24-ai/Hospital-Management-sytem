"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export type ChatNotification = {
  id: string;
  conversation_id: string;
  sender_name: string;
  preview: string;
  created_at: string;
  is_read: boolean;
};

type Audience = "patient" | "admin" | null;
type RawMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
  conversation: { id: string; patient_id: string; subject: string | null } | null;
};
type DiagnosticError = { name?: string; code?: string; message?: string; status?: number; statusCode?: number; details?: string; hint?: string };

const isAdminRole = (value: unknown) => ["admin", "super_admin"].includes(String(value ?? "").trim().toLowerCase());
const isMissingSession = (error: unknown) => diagnostic(error).name === "AuthSessionMissingError";
const formatError = (error: DiagnosticError) => `${error.code ? `(${error.code}) ` : ""}${error.message || "Unknown Supabase error"}${error.details ? ` ${error.details}` : ""}${error.hint ? ` Hint: ${error.hint}` : ""}`;
const diagnostic = (error: unknown) => {
  if (!error || typeof error !== "object") return { name: undefined, code: undefined, message: String(error), status: undefined };
  const item = error as DiagnosticError;
  return { name: item.name, code: item.code, message: item.message, details: item.details, hint: item.hint, status: item.status ?? item.statusCode };
};
const isTemporaryNetworkError = (error: unknown) => {
  const item = diagnostic(error);
  return item.name === "AuthRetryableFetchError" || /failed to fetch|network|timeout|temporar/i.test(item.message ?? "");
};

export function useChatNotifications(audience: Audience, userId?: string) {
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(Boolean(audience));
  const [error, setError] = useState("");
  const [realtimeNotice, setRealtimeNotice] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState("CLOSED");
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null);

  const refresh = useCallback((): Promise<boolean> => {
    if (!audience || !userId) {
      requestIdRef.current += 1;
      inFlightRef.current = null;
      setNotifications([]); setUnreadCount(0); setError(""); setLoading(false);
      return Promise.resolve(true);
    }
    if (!supabase) {
      setError("Notifications are unavailable because Supabase is not configured."); setLoading(false);
      return Promise.resolve(false);
    }
    const key = `${audience}:${userId}`;
    if (inFlightRef.current?.key === key) return inFlightRef.current.promise;
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    const client = supabase;
    setLoading(true);

    const task = (async () => {
      try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        if (sessionError) {
          if (isMissingSession(sessionError)) {
            if (isCurrent()) { setNotifications([]); setUnreadCount(0); setError(""); }
            return false;
          }
          const details = diagnostic(sessionError);
          if (isCurrent()) setError(isTemporaryNetworkError(sessionError)
            ? "Supabase could not be reached. Notifications will retry when the connection returns."
            : `Authentication session lookup failed: ${formatError(sessionError)}`);
          console.error("[ChatNotifications] Session lookup failed", { operation: "auth.getSession", ...details });
          return false;
        }
        if (!session) {
          if (isCurrent()) { setNotifications([]); setUnreadCount(0); setError(""); }
          return false;
        }
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError) {
          if (isMissingSession(authError)) {
            if (isCurrent()) { setNotifications([]); setUnreadCount(0); setError(""); }
            return false;
          }
          const details = diagnostic(authError);
          if (isTemporaryNetworkError(authError)) console.warn("[ChatNotifications] Temporary auth verification failure", { operation: "auth.getUser", ...details });
          else console.error("[ChatNotifications] Auth verification failed", { operation: "auth.getUser", ...details });
          if (isCurrent()) setError(isTemporaryNetworkError(authError)
            ? "Supabase could not be reached. Notifications will retry when the connection returns."
            : `Authentication check failed: ${formatError(authError)}`);
          return false;
        }
        if (!user || user.id !== userId) {
          if (isCurrent()) {
            setNotifications([]);
            setUnreadCount(0);
            setError(user ? "The authenticated account changed. Refresh the page to reload notifications." : "");
          }
          return false;
        }

        // Verify role against the database profile. Frontend state and user metadata
        // are intentionally not used to grant notification access.
        const { data: profile, error: profileError } = await client.from("profiles")
          .select("role").eq("id", user.id).maybeSingle();
        if (profileError) {
          const details = diagnostic(profileError);
          console.error("[ChatNotifications] Profile role lookup failed", { operation: "profiles.select(role)", userId: user.id, ...details });
          if (isCurrent()) setError(profileError.code === "42501"
            ? "Your account cannot read its notification profile. Check the profiles SELECT policy."
            : `Profile lookup failed: ${formatError(profileError)}`);
          return false;
        }
        if (!profile) {
          if (isCurrent()) setError("No profile is linked to this authenticated account.");
          return false;
        }
        const role = String(profile.role ?? "").trim().toLowerCase();
        const authorized = audience === "admin" ? isAdminRole(role) : role === "patient";
        if (!authorized) {
          if (isCurrent()) setError(`This account's database role (${role || "empty"}) is not authorized for ${audience} notifications.`);
          return false;
        }

        const senderRoles = audience === "patient" ? ["ADMIN", "STAFF", "admin", "staff"] : ["PATIENT", "patient"];
        const messageQuery = client.from("messages")
          .select("id, conversation_id, sender_id, sender_role, message, created_at, conversation:conversations!inner(id, patient_id, subject)", { count: "exact" })
          .neq("sender_id", user.id).in("sender_role", senderRoles)
          .order("created_at", { ascending: false }).limit(40);
        const countQuery = client.from("messages").select("id", { count: "exact", head: true })
          .neq("sender_id", user.id).in("sender_role", senderRoles);
        const receiptsCountQuery = client.from("message_read_receipts").select("message_id", { count: "exact", head: true }).eq("user_id", user.id);
        const [messageResult, countResult, receiptsCountResult] = await Promise.all([messageQuery, countQuery, receiptsCountQuery]);
        if (messageResult.error || countResult.error || receiptsCountResult.error) {
          const failures = [
            { operation: "messages.select(recent)", error: messageResult.error },
            { operation: "messages.count(unread candidates)", error: countResult.error },
            { operation: "message_read_receipts.count(user)", error: receiptsCountResult.error },
          ].filter((failure) => failure.error);
          console.error("[ChatNotifications] Notification query failed", failures.map(({ operation, error: failure }) => ({ operation, ...diagnostic(failure) })));
          if (isCurrent()) setError(formatError(failures[0].error as DiagnosticError));
          return false;
        }

        const rows = (messageResult.data ?? []) as unknown as RawMessage[];
        const messageIds = rows.map((row) => row.id);
        let readIds = new Set<string>();
        if (messageIds.length) {
          const { data: receipts, error: receiptsError } = await client.from("message_read_receipts")
            .select("message_id").eq("user_id", user.id).in("message_id", messageIds);
          if (receiptsError) {
            console.error("[ChatNotifications] Read receipt lookup failed", { operation: "message_read_receipts.select(recent)", ...diagnostic(receiptsError) });
            if (isCurrent()) setError(formatError(receiptsError));
            return false;
          }
          readIds = new Set((receipts ?? []).map((receipt) => receipt.message_id));
        }

        let patientNames: Record<string, string> = {};
        if (audience === "admin") {
          const patientIds = [...new Set(rows.map((row) => row.conversation?.patient_id).filter((id): id is string => Boolean(id)))];
          if (patientIds.length) {
            const { data: profiles, error: namesError } = await client.from("profiles")
              .select("id, first_name, middle_name, last_name").in("id", patientIds);
            if (namesError) {
              console.error("[ChatNotifications] Patient sender lookup failed", { operation: "profiles.select(patient names)", ...diagnostic(namesError) });
              if (isCurrent()) setError(formatError(namesError));
              return false;
            }
            patientNames = Object.fromEntries((profiles ?? []).map((person) => [
              person.id,
              [person.first_name, person.middle_name, person.last_name].filter(Boolean).join(" ") || "Patient",
            ]));
          }
        }

        if (!isCurrent()) return false;
        setNotifications(rows.map((row) => ({
          id: row.id,
          conversation_id: row.conversation_id,
          sender_name: audience === "patient"
            ? (row.sender_role.toUpperCase() === "ADMIN" ? "MedWell Admin" : "Hospital Staff")
            : patientNames[row.conversation?.patient_id ?? ""] || "Patient",
          preview: row.message,
          created_at: row.created_at,
          is_read: readIds.has(row.id),
        })));
        setUnreadCount(Math.max(0, (countResult.count ?? 0) - (receiptsCountResult.count ?? 0)));
        setError("");
        return true;
      } catch (caught) {
        const details = diagnostic(caught);
        if (isTemporaryNetworkError(caught)) console.warn("[ChatNotifications] Temporary notification network failure", { operation: "notification refresh", ...details });
        else console.error("[ChatNotifications] Unexpected notification refresh failure", { operation: "notification refresh", ...details });
        if (isCurrent()) setError(isTemporaryNetworkError(caught)
          ? "Supabase could not be reached. Notifications will retry when the connection returns."
          : details.message || "Notifications could not be loaded.");
        return false;
      } finally {
        if (isCurrent()) setLoading(false);
      }
    })();
    inFlightRef.current = { key, promise: task };
    void task.finally(() => { if (inFlightRef.current?.promise === task) inFlightRef.current = null; });
    return task;
  }, [audience, userId]);

  useEffect(() => {
    if (!audience || !userId || !supabase) { void refresh(); return; }
    const client = supabase;
    let active = true;
    let channel: RealtimeChannel | null = null;
    let channelGeneration = 0;
    let reconnecting = false;
    let currentChannelStatus = "CLOSED";

    const openChannel = () => {
      if (!active || channel) return;
      const generation = ++channelGeneration;
      const nextChannel = client.channel(`chat-notifications-${audience}-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => { if (active) void refresh(); })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_read_receipts", filter: `user_id=eq.${userId}` }, () => { if (active) void refresh(); })
        .subscribe((status, channelError) => {
          if (!active || generation !== channelGeneration) return;
          currentChannelStatus = status;
          setRealtimeStatus(status);
          if (status === "SUBSCRIBED") { setRealtimeNotice(""); void refresh(); }
          else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            const details = diagnostic(channelError);
            console.warn("[ChatNotifications] Realtime channel unavailable", { operation: "realtime.subscribe", channelStatus: status, ...details });
            setRealtimeNotice("Live updates are temporarily unavailable. Notifications will continue to refresh automatically.");
          }
        });
      channel = nextChannel;
    };

    const startAfterSessionCheck = async () => {
      const verified = await refresh();
      if (active && verified) openChannel();
    };
    void startAfterSessionCheck();
    const { data: { subscription: authSubscription } } = client.auth.onAuthStateChange((event, session) => {
      queueMicrotask(() => {
        if (!active) return;
        if (!session || session.user.id !== userId) {
          requestIdRef.current += 1;
          inFlightRef.current = null;
          setNotifications([]); setUnreadCount(0); setError(""); setLoading(false);
          channelGeneration += 1;
          currentChannelStatus = "CLOSED";
          setRealtimeStatus("CLOSED");
          if (channel) { const old = channel; channel = null; void client.removeChannel(old); }
          return;
        }
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          void refresh().then((verified) => { if (active && verified) openChannel(); });
        }
      });
    });
    const fallback = window.setInterval(() => { if (active) void refresh(); }, 60000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onChatUpdated = () => { void refresh(); };
    const onOnline = async () => {
      if (!active || reconnecting) return;
      reconnecting = true;
      try {
        const verified = await refresh();
        if (!active || !verified) return;
        if (!channel || !["SUBSCRIBED", "JOINING"].includes(currentChannelStatus)) {
          if (channel) { const old = channel; channel = null; await client.removeChannel(old); }
          currentChannelStatus = "CLOSED";
          openChannel();
        }
      } finally { reconnecting = false; }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("mediwell:chat-updated", onChatUpdated);
    window.addEventListener("online", onOnline);
    return () => {
      active = false; channelGeneration += 1; window.clearInterval(fallback);
      authSubscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("mediwell:chat-updated", onChatUpdated);
      window.removeEventListener("online", onOnline);
      if (channel) void client.removeChannel(channel);
    };
  }, [audience, userId, refresh]);

  return { notifications, unreadCount, loading, error, realtimeNotice, realtimeStatus, refresh };
}
