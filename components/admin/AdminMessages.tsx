"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { markConversationMessagesRead } from "@/lib/supabase/chatReadReceipts";

type Conversation = { id: string; patient_id: string; subject: string | null; status: string; created_at: string; updated_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; sender_role: string; message: string; created_at: string };
type Patient = { id: string; first_name: string | null; middle_name: string | null; last_name: string | null; suffix: string | null; email: string | null };
const statuses = ["open", "resolved"];
const pretty = (value: string) => value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : "Open";
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
const fullDate = (value: string) => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortDate = (value: string) => new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
const displayPatientName = (person?: Patient) => [person?.first_name, person?.middle_name, person?.last_name, person?.suffix].filter((part): part is string => Boolean(part?.trim())).join(" ") || "Name not provided";
const describeError = (label: string, error: { code?: string; message?: string; details?: string; hint?: string }) =>
  `${label}${error.code ? ` (${error.code})` : ""}: ${error.message || "Unknown Supabase error"}${error.details ? ` ${error.details}` : ""}${error.hint ? ` Hint: ${error.hint}` : ""}`;

export default function AdminMessages({ initialConversationId = "" }: { initialConversationId?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestMessages, setLatestMessages] = useState<Record<string, Message>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [patients, setPatients] = useState<Record<string, Patient>>({});
  const [selectedId, setSelectedId] = useState(initialConversationId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [relatedDataError, setRelatedDataError] = useState("");
  const [chatError, setChatError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [sendError, setSendError] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [mobileChat, setMobileChat] = useState(Boolean(initialConversationId));
  const threadRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const inboxLoadedRef = useRef(false);

  const loadInbox = useCallback(async () => {
    if (!supabase) { setInboxError("Messaging is unavailable because Supabase is not configured."); setLoadingInbox(false); return; }
    if (!inboxLoadedRef.current) setLoadingInbox(true);
    setInboxError(""); setRelatedDataError("");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError && sessionError.name !== "AuthSessionMissingError") {
      console.error("[AdminMessages] Admin session lookup failed", { operation: "auth.getSession", code: sessionError.code, message: sessionError.message, status: sessionError.status });
      setInboxError(describeError("Could not restore the signed-in account", sessionError)); setLoadingInbox(false); return;
    }
    if (!session) {
      setConversations([]); setMessages([]); setPatients({}); setLatestMessages({}); setUnreadCounts({});
      setInboxError("Sign in as an administrator to view patient conversations."); setLoadingInbox(false); return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      const message = authError ? describeError("Could not verify the signed-in account", authError) : "No authenticated account is available. Sign in as an administrator and retry.";
      if (authError?.name !== "AuthSessionMissingError") {
        console.error("[AdminMessages] Admin session verification failed", { operation: "auth.getUser", code: authError?.code, message: authError?.message, status: authError?.status });
      }
      setInboxError(message); setLoadingInbox(false); return;
    }
    const { data: staffAccess, error: staffError } = await supabase.rpc("is_hospital_staff");
    if (staffError || staffAccess !== true) {
      const message = staffError ? describeError("Could not verify administrator messaging access", staffError) : "This authenticated account is not authorized to view the admin inbox.";
      console.error("[AdminMessages] Admin authorization failed", staffError ?? { userId: user.id, staffAccess });
      setInboxError(message); setLoadingInbox(false); return;
    }
    const { data, error } = await supabase.from("conversations").select("id, patient_id, subject, status, created_at, updated_at").order("updated_at", { ascending: false });
    if (error) { console.error("[AdminMessages] Failed to load conversations", error); setInboxError(describeError("Conversations could not be loaded", error)); setLoadingInbox(false); return; }
    const rows = (data ?? []) as Conversation[];
    setConversations(rows);
    setPatients({});
    setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows.some((row) => row.id === initialConversationId) ? initialConversationId : rows[0]?.id ?? "");
    if (rows.length) {
      const { data: recentMessages, error: recentError } = await supabase.from("messages").select("id, conversation_id, sender_id, sender_role, message, created_at").in("conversation_id", rows.map((row) => row.id)).order("created_at", { ascending: false });
      if (!recentError) {
        const latest: Record<string, Message> = {};
        for (const message of (recentMessages ?? []) as Message[]) if (!latest[message.conversation_id]) latest[message.conversation_id] = message;
        setLatestMessages(latest);
        const candidates = ((recentMessages ?? []) as Message[]).filter((message) => message.sender_role.toUpperCase() === "PATIENT" && message.sender_id !== user.id);
        const receiptIds = new Set<string>();
        let receiptLookupFailed = false;
        for (let offset = 0; offset < candidates.length; offset += 200) {
          const messageIds = candidates.slice(offset, offset + 200).map((message) => message.id);
          const { data: receipts, error: receiptError } = await supabase.from("message_read_receipts").select("message_id").eq("user_id", user.id).in("message_id", messageIds);
          if (receiptError) {
            console.error("[AdminMessages] Failed to load unread message receipts", receiptError);
            setRelatedDataError((current) => [current, describeError("Unread indicators could not be loaded", receiptError)].filter(Boolean).join(" "));
            receiptLookupFailed = true;
            break;
          }
          for (const receipt of receipts ?? []) receiptIds.add(receipt.message_id);
        }
        if (receiptLookupFailed) setUnreadCounts({});
        else {
          const unread: Record<string, number> = {};
          for (const message of candidates) if (!receiptIds.has(message.id)) unread[message.conversation_id] = (unread[message.conversation_id] ?? 0) + 1;
          setUnreadCounts(unread);
        }
      } else { console.error("[AdminMessages] Failed to load conversation previews", recentError); setRelatedDataError(describeError("Message previews could not be loaded", recentError)); }
    } else { setLatestMessages({}); setUnreadCounts({}); }
    const ids = [...new Set(rows.map((row) => row.patient_id))];
    if (ids.length) {
      const { data: people, error: peopleError } = await supabase.from("profiles").select("id, first_name, middle_name, last_name, suffix, email").in("id", ids);
      if (peopleError) {
        console.error("[AdminMessages] Failed to load patient profiles", peopleError);
        setRelatedDataError((current) => [current, describeError("Patient profiles could not be loaded", peopleError)].filter(Boolean).join(" "));
      } else if (people) setPatients(Object.fromEntries((people as Patient[]).map((person) => [person.id, person])));
    }
    inboxLoadedRef.current = true;
    setLoadingInbox(false);
  }, [initialConversationId]);

  useEffect(() => {
    void loadInbox();
    if (!supabase) return;
    const client = supabase;
    const channel = supabase.channel("admin-messages-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => { void loadInbox(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => { void loadInbox(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [loadInbox]);

  const loadMessages = useCallback(async (id: string) => {
    if (!supabase || !id) { setMessages([]); return; }
    shouldAutoScrollRef.current = true;
    setLoadingMessages(true); setChatError("");
    const { data, error } = await supabase.from("messages").select("id, conversation_id, sender_id, sender_role, message, created_at").eq("conversation_id", id).order("created_at", { ascending: true });
    if (error) { console.error("[AdminMessages] Failed to load messages", error); setChatError(describeError("Messages could not be loaded", error)); }
    else {
      setMessages((data ?? []) as Message[]);
      void markConversationMessagesRead(id, "admin").then(() => { void loadInbox(); });
    }
    setLoadingMessages(false);
  }, [loadInbox]);

  useEffect(() => {
    void loadMessages(selectedId);
    if (!supabase || !selectedId) return;
    const client = supabase;
    const channel = supabase.channel(`admin-chat-${selectedId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, (payload) => {
      const incoming = payload.new as Message;
      const thread = threadRef.current;
      shouldAutoScrollRef.current = !thread || thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
      setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming]);
      if (incoming.sender_role.toUpperCase() === "PATIENT") void markConversationMessagesRead(selectedId, "admin").then(() => { void loadInbox(); });
      void loadInbox();
    }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [selectedId, loadInbox, loadMessages]);

  useEffect(() => {
    if (!shouldAutoScrollRef.current || loadingMessages) return;
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    shouldAutoScrollRef.current = false;
  }, [messages, loadingMessages]);

  const latestByConversation = useMemo(() => {
    const map = { ...latestMessages };
    for (const message of messages) if (!map[message.conversation_id] || map[message.conversation_id].created_at < message.created_at) map[message.conversation_id] = message;
    return map;
  }, [latestMessages, messages]);
  const statusOptions = useMemo(() => Array.from(new Set([...statuses, ...conversations.map((item) => item.status?.toLowerCase()).filter((value): value is string => Boolean(value))])), [conversations]);
  const filtered = useMemo(() => conversations.filter((item) => {
    const person = patients[item.patient_id];
    const term = query.trim().toLowerCase();
    const name = displayPatientName(person);
    return (!term || `${name} ${item.subject ?? ""}`.toLowerCase().includes(term)) &&
      (filter === "all" || item.status?.toLowerCase() === filter || (filter === "replied" && ["admin", "staff"].includes(latestByConversation[item.id]?.sender_role?.toLowerCase() ?? "")));
  }), [conversations, filter, latestByConversation, patients, query]);
  const selected = conversations.find((item) => item.id === selectedId);
  const patient = selected ? patients[selected.patient_id] : undefined;
  const patientName = displayPatientName(patient);
  const counts = useMemo(() => ({ total: conversations.length, open: conversations.filter((item) => item.status?.toLowerCase() === "open").length, replied: conversations.filter((item) => ["admin", "staff"].includes(latestByConversation[item.id]?.sender_role?.toLowerCase() ?? "")).length, resolved: conversations.filter((item) => item.status?.toLowerCase() === "resolved").length }), [conversations, latestByConversation]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault(); const text = draft.trim();
    if (!text || !selectedId || sendingRef.current || !supabase) return;
    sendingRef.current = true; setSending(true); setSendError("");
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError && sessionError.name !== "AuthSessionMissingError") throw sessionError;
      if (!session) throw new Error("Sign in as an administrator before replying.");
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError?.name === "AuthSessionMissingError") throw new Error("Your session ended. Sign in again before replying.");
      if (authError || !user) throw authError ?? new Error("No authenticated user");
      const { data: staff, error: roleError } = await supabase.rpc("is_hospital_staff");
      if (roleError) throw roleError;
      if (staff !== true) throw new Error("Administrator messaging access could not be verified.");
      const { data, error } = await supabase.from("messages").insert({ conversation_id: selectedId, sender_id: user.id, sender_role: "ADMIN", message: text }).select("id, conversation_id, sender_id, sender_role, message, created_at").single();
      if (error) throw error;
      shouldAutoScrollRef.current = true;
      setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data as Message]); setDraft(""); window.dispatchEvent(new Event("mediwell:chat-updated")); void loadInbox();
      requestAnimationFrame(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }));
    } catch (error) {
      const authError = error as { name?: string; code?: string; message?: string; details?: string; hint?: string };
      if (authError.name !== "AuthSessionMissingError" && authError.message !== "Sign in as an administrator before replying." && authError.message !== "Your session ended. Sign in again before replying.") {
        console.error("[AdminMessages] Failed to save message", { operation: "messages.insert", name: authError.name, code: authError.code, message: authError.message ?? String(error), details: authError.details, hint: authError.hint });
      }
      const details = authError.message ?? String(error);
      setSendError(`${(error as { code?: string })?.code ? `(${(error as { code?: string }).code}) ` : ""}${details}`);
    } finally { sendingRef.current = false; setSending(false); }
  };

  const updateStatus = async (status: string) => {
    if (!supabase || !selected) return;
    setStatusNotice(""); setStatusError("");
    const { data, error } = await supabase.from("conversations").update({ status }).eq("id", selected.id).select("id,status").maybeSingle();
    if (error || !data) { console.error("[AdminMessages] Failed to update conversation status", error ?? { message: "No conversation matched the update." }); setStatusError(error ? describeError("Conversation status could not be updated", error) : "Conversation was not found; its status was not changed."); return; }
    setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, status: data.status } : item));
    setStatusNotice(`Conversation marked ${pretty(data.status).toLowerCase()}.`);
  };

  return <section className={`admin-messages ${mobileChat ? "mobile-chat-open" : ""}`}>
    <div className="admin-message-stats">
      {[ ["Total Conversations", counts.total, "▤", "blue"], ["Open", counts.open, "◷", "teal"], ["Replied", counts.replied, "↗", "orange"], ["Resolved", counts.resolved, "✓", "purple"] ].map(([label, value, icon, color]) => <div className="admin-message-stat" key={String(label)}><span className={`stat-icon ${color}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>)}
    </div>
    <div className="admin-message-workspace">
      <aside className="admin-message-inbox">
        <div className="inbox-heading"><div><h2>Inbox</h2><span>{conversations.length} conversations</span></div><span className="inbox-live"><i /> Live</span></div>
        <label className="inbox-search"><Search size={16} aria-hidden="true"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patients or subjects" /></label>
        <div className="inbox-filter"><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter conversations"><option value="all">All statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{pretty(status)}</option>)}</select></div>
        <div className="inbox-list">
          {loadingInbox ? <div className="inbox-state">Loading conversations…</div> : inboxError ? <div className="inbox-state error">{inboxError}<button onClick={() => void loadInbox()}>Retry</button></div> : <>{relatedDataError && <div className="inbox-state error" role="status">{relatedDataError}</div>}{!conversations.length ? <div className="inbox-state">No patient conversations yet. New patient messages will appear here.</div> : !filtered.length ? <div className="inbox-state">No conversations match this search.</div> : filtered.map((item) => {
            const person = patients[item.patient_id]; const name = displayPatientName(person); const latest = latestByConversation[item.id]; const unread = unreadCounts[item.id] ?? 0;
            return <button key={item.id} className={`conversation-card ${item.id === selectedId ? "selected" : ""}`} onClick={() => { setSelectedId(item.id); setMobileChat(true); }}>
              <span className="patient-avatar">{initials(name)}</span><span className="conversation-copy"><span className="conversation-top"><strong>{name}</strong><time>{fullDate(latest?.created_at ?? item.updated_at ?? item.created_at)}</time></span><span className="conversation-subject">{item.subject || "Patient inquiry"}</span><span className="conversation-preview">{latest?.message || "No messages yet"}</span><span className="conversation-card-meta"><span className={`status-pill ${item.status?.toLowerCase() || "open"}`}>{pretty(item.status)}</span>{unread > 0 ? <span className="conversation-unread" aria-label={`${unread} unread patient messages`}>{unread > 99 ? "99+" : unread}</span> : null}</span></span>
            </button>;
          })}</>}
        </div>
      </aside>
      <section className="admin-message-chat" aria-label="Active conversation">
        {!selected ? <div className="chat-placeholder"><span>✉</span><h2>Select a conversation</h2><p>Choose a patient from the inbox to view the conversation.</p></div> : <>
          <header className="active-chat-header"><button className="back-to-inbox" onClick={() => setMobileChat(false)}><ArrowLeft size={16} aria-hidden="true"/><span>Back to Inbox</span></button><span className="patient-avatar large">{initials(patientName)}</span><div className="active-patient"><h2>{patientName}</h2><p>{patient?.email || "Patient conversation"}</p></div><label className="status-control"><span>Status</span><select value={selected.status?.toLowerCase() || "open"} onChange={(event) => void updateStatus(event.target.value)}>{statusOptions.map((status) => <option key={status} value={status}>{pretty(status)}</option>)}</select></label></header>
          <div className="active-chat-subject">{selected.subject || "Patient inquiry"}</div>
          {statusNotice ? <div className="chat-status-notice" role="status">{statusNotice}</div> : null}
          {statusError ? <div className="chat-status-error" role="alert">{statusError}</div> : null}
          <div className="admin-chat-thread" role="log" aria-live="polite" ref={threadRef}>
            {chatError ? <div className="chat-load-error" role="alert">{chatError}<button onClick={() => void loadMessages(selected.id)}>Retry</button></div> : loadingMessages ? <div className="chat-thread-state">Loading messages…</div> : !messages.length ? <div className="chat-thread-state">No messages in this conversation yet.</div> : messages.map((message, index) => {
              const own = ["admin", "staff"].includes(message.sender_role?.toLowerCase() ?? ""); const previous = messages[index - 1]; const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
              return <div key={message.id}>{newDay && <div className="chat-date-separator"><span>{shortDate(message.created_at)}</span></div>}<div className={`admin-chat-message ${own ? "staff" : "patient"}`}><span>{own ? "MedWell Team" : patientName === "Name not provided" ? "Patient" : patientName}</span><p>{message.message}</p><time>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></div>;
            })}
          </div>
          <form className="admin-chat-composer" onSubmit={sendMessage}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Write a secure message…" maxLength={10000} rows={1} disabled={sending} aria-label="Write a message"/><button type="submit" disabled={!draft.trim() || sending} aria-label="Send reply">{sending ? <span className="send-spinner" /> : <><span>Send</span><Send size={15} aria-hidden="true"/></>}</button><span className="composer-hint">Enter to send · Shift + Enter for a new line</span>{sendError && <p role="alert">{sendError}</p>}</form>
        </>}
      </section>
    </div>
  </section>;
}
