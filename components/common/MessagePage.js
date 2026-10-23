"use client";

import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { markConversationMessagesRead } from "@/lib/supabase/chatReadReceipts";

const loginEventName = "mediwell:open-login";

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function logMessagingError(action, error, context = {}) {
  const candidates = [
    error,
    error && typeof error === "object" ? error.error : undefined,
    error && typeof error === "object" ? error.cause : undefined,
    error && typeof error === "object" ? error.context : undefined,
    error && typeof error === "object" ? error.response : undefined,
  ].filter((value) => value && typeof value === "object");
  const read = (key) => candidates.map((candidate) => {
    try { return candidate[key]; } catch { return undefined; }
  }).find((value) => value !== undefined && value !== null && value !== "");
  const name = read("name");
  const code = read("code");
  const message = read("message");
  const details = read("details");
  const hint = read("hint");
  const status = read("status");
  const statusText = read("statusText");
  const fallback = error === undefined ? "Thrown value was undefined" : error === null ? "Thrown value was null" : String(error);

  console.error(`[MessagePage] Failed to ${action}`, {
    errorType: error === null ? "null" : typeof error,
    name: typeof name === "string" ? name : error instanceof Error ? error.name : undefined,
    code: typeof code === "string" ? code : undefined,
    message: typeof message === "string" ? message : error instanceof Error && error.message ? error.message : fallback,
    details: typeof details === "string" ? details : undefined,
    hint: typeof hint === "string" ? hint : undefined,
    status: typeof status === "number" ? status : undefined,
    statusText: typeof statusText === "string" ? statusText : undefined,
    ...context,
  });
}

function getSendErrorMessage(error) {
  const code = [error, error?.error, error?.cause, error?.context, error?.response]
    .find((candidate) => candidate && typeof candidate.code === "string")?.code;
  if (code === "42501") return "Your account is not allowed to send messages in this conversation.";
  if (code === "23514") return "Your message could not be saved. Please check its length and try again.";
  if (code === "23503") return "This conversation is no longer available. Refresh the page and try again.";
  if (code === "AUTH_SESSION_MISSING") return "Your sign-in has expired. Please log in again to send a message.";
  if (code === "MESSAGE_CONVERSATION_FORBIDDEN") return "You don't have access to this conversation. Refresh the page and try again.";
  if (error && typeof error === "object" && (error.status === 401 || error.status === 403)) {
    return "Your session does not have permission to send this message. Please log in again or contact support.";
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return "We couldn't connect to the messaging service. Check your connection and try again.";
  }
  return "Your message couldn't be saved. Please check your connection and try again.";
}

export default function MessagePage() {
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("checking");
  const [isStaff, setIsStaff] = useState(false);
  const [staffCheckComplete, setStaffCheckComplete] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!supabase) {
      setAuthStatus("unavailable");
      return undefined;
    }

    let active = true;
    const applySession = (session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setAuthStatus(nextUser ? "signed-in" : "signed-out");
      setIsStaff(false);
      setStaffCheckComplete(!nextUser);
      setConversations([]);
      setConversationId("");
      setMessages([]);
      setLoadError("");
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) applySession(session);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "signed-in" || !user || !supabase) return undefined;

    let active = true;
    setStaffCheckComplete(false);

    supabase.rpc("is_hospital_staff").then(({ data, error }) => {
      if (!active) return;
      setIsStaff(!error && data === true);
      setStaffCheckComplete(true);
    }).catch(() => {
      if (!active) return;
      setIsStaff(false);
      setStaffCheckComplete(true);
    });

    return () => {
      active = false;
    };
  }, [authStatus, user]);

  useEffect(() => {
    if (authStatus !== "signed-in" || !user || !supabase || !staffCheckComplete) return undefined;

    let active = true;
    const loadConversations = async (showLoading = false) => {
      if (showLoading) setIsLoadingConversation(true);
      const query = supabase
        .from("conversations")
        .select("id, patient_id, created_at")
        .order("created_at", { ascending: false });
      const result = isStaff
        ? await query
        : await query.eq("patient_id", user.id).maybeSingle();

      if (!active) return;
      if (result.error) {
        logMessagingError("load conversations", result.error);
        setLoadError("Your conversations couldn't be loaded. Confirm the messaging database is set up and try again.");
      } else {
        const rows = isStaff ? result.data ?? [] : result.data ? [result.data] : [];
        setConversations(rows);
        setConversationId((current) => {
          if (current && rows.some((conversation) => conversation.id === current)) return current;
          const requestedId = new URLSearchParams(window.location.search).get("conversation");
          if (requestedId && rows.some((conversation) => conversation.id === requestedId)) return requestedId;
          return isStaff ? rows[0]?.id ?? "" : rows[0]?.id ?? "";
        });
        setLoadError("");
      }
      if (showLoading) setIsLoadingConversation(false);
    };

    void loadConversations(true);
    const interval = window.setInterval(() => void loadConversations(), 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [authStatus, isStaff, staffCheckComplete, user]);

  useEffect(() => {
    if (authStatus !== "signed-in" || !user || !supabase || !staffCheckComplete) return undefined;
    if (!conversationId) {
      setMessages([]);
      setIsLoadingMessages(false);
      return undefined;
    }

    let active = true;
    const loadMessages = async (showLoading = false) => {
      if (showLoading) setIsLoadingMessages(true);
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, sender_role, message, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (error) {
        logMessagingError("load messages", error);
        setLoadError("Messages couldn't be loaded. Confirm the messaging database is set up and try again.");
      } else {
        setMessages(data ?? []);
        setLoadError("");
        if (!isStaff) void markConversationMessagesRead(conversationId, "patient");
      }
      if (showLoading) setIsLoadingMessages(false);
    };

    void loadMessages(true);
    const interval = window.setInterval(() => void loadMessages(), 8000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [authStatus, conversationId, staffCheckComplete, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoadingMessages]);

  const startConversation = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ patient_id: user.id })
      .select("id, patient_id, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existing, error: lookupError } = await supabase
          .from("conversations")
          .select("id, patient_id, created_at")
          .eq("patient_id", user.id)
          .single();
        if (!lookupError && existing) return existing;
      }
      throw error;
    }

    return data;
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const messageText = draft.trim();
    if (!messageText || isSending || !user || !supabase) return;

    setIsSending(true);
    setSendError("");
    setSendSuccess("");
    let action = "validate session";
    let sendContext = {};
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        throw Object.assign(new Error("A valid signed-in session is required to send a message."), { code: "AUTH_SESSION_MISSING" });
      }
      const { data: sessionData, error: userError } = await supabase.auth.getUser();
      if (userError?.name === "AuthSessionMissingError") {
        throw Object.assign(new Error("A valid signed-in session is required to send a message."), { code: "AUTH_SESSION_MISSING" });
      }
      if (userError) throw userError;
      if (!sessionData.user || sessionData.user.id !== user.id) {
        throw Object.assign(new Error("A valid signed-in session is required to send a message."), { code: "AUTH_SESSION_MISSING" });
      }
      const authenticatedUserId = sessionData.user.id;

      action = "verify messaging permissions";
      const { data: staffAccess, error: staffAccessError } = await supabase.rpc("is_hospital_staff");
      if (staffAccessError) throw staffAccessError;
      const senderRole = staffAccess === true ? "staff" : "patient";
      sendContext = { senderRole, conversationAccessible: false };

      let activeConversationId = conversationId;
      if (!activeConversationId && senderRole === "patient") {
        action = "create or find patient conversation";
        const conversation = await startConversation();
        if (!conversation?.id) throw new Error("Supabase returned no patient conversation record.");
        activeConversationId = conversation.id;
        setConversationId(conversation.id);
        setConversations((current) => [conversation, ...current]);
      }

      if (!activeConversationId) {
        setSendError("Select a conversation before replying.");
        return;
      }

      action = "verify conversation access";
      const { data: authorizedConversation, error: conversationAccessError } = await supabase
        .from("conversations")
        .select("id, patient_id")
        .eq("id", activeConversationId)
        .maybeSingle();
      if (conversationAccessError) throw conversationAccessError;
      const patientOwnsConversation = authorizedConversation?.patient_id === authenticatedUserId;
      if (!authorizedConversation || (senderRole === "patient" && !patientOwnsConversation)) {
        throw Object.assign(new Error("The selected conversation is not available to this account."), { code: "MESSAGE_CONVERSATION_FORBIDDEN" });
      }
      sendContext = { senderRole, conversationAccessible: true, patientOwnsConversation };

      action = "insert message";
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: authenticatedUserId,
          sender_role: senderRole === "staff" ? "STAFF" : "PATIENT",
          message: messageText,
        })
        .select("id, conversation_id, sender_id, sender_role, message, created_at")
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error("Supabase returned no saved message record.");
      setMessages((current) => [...current, data]);
      setDraft("");
      window.dispatchEvent(new Event("mediwell:chat-updated"));
      setSendSuccess("Message sent successfully.");
    } catch (error) {
      logMessagingError(action, error, sendContext);
      setSendError(getSendErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  const openLogin = (event) => {
    event.preventDefault();
    window.dispatchEvent(new Event(loginEventName));
  };

  const messageArea = () => {
    if (isLoadingMessages || isLoadingConversation || (authStatus === "signed-in" && !staffCheckComplete)) {
      return <p className="message-state">Loading your conversation...</p>;
    }

    if (isStaff && !conversationId) {
      return <p className="message-state">No conversations yet. New patient messages will appear here.</p>;
    }

    if (!messages.length) {
      return (
        <>
          {!isStaff && (
            <div className="chat-message hospital-message">
              <p>Hello! Welcome to MedWell Medical Hospital. How can we help you today?</p>
              <time>{formatTime(new Date())}</time>
            </div>
          )}
          <p className="message-empty-state">
            {isStaff ? "No messages in this conversation yet." : "This is the start of your conversation. Send us a message whenever you're ready."}
          </p>
        </>
      );
    }

    return messages.map((message) => {
      const isOwnMessage = message.sender_id === user?.id;
      const isHospitalMessage = message.sender_role?.toUpperCase() === "STAFF";
      return (
        <div
          className={`chat-message ${isOwnMessage ? "own-message" : "hospital-message"}`}
          key={message.id}
        >
          <span className="message-sender">
            {isHospitalMessage ? "MedWell Medical Hospital" : isStaff ? "Patient" : "You"}
          </span>
          <p>{message.message}</p>
          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
        </div>
      );
    });
  };

  return (
    <section className="message-page">
      <div className="message-page-inner">
        <section className="message-panel" aria-label="MedWell Medical Hospital messaging">
          <header className="message-panel-header">
            <span className="message-hospital-icon" aria-hidden="true">+</span>
            <div className="message-hospital-copy">
              <h2>MedWell Medical Hospital</h2>
              <p><span className="online-indicator" />We typically reply within a few hours</p>
            </div>
          </header>

          {isStaff && authStatus === "signed-in" && (
            <div className="message-staff-selector">
              <label htmlFor="message-conversation">Patient conversation</label>
              <select
                id="message-conversation"
                value={conversationId}
                onChange={(event) => setConversationId(event.target.value)}
                disabled={!conversations.length}
              >
                {!conversations.length && <option value="">No conversations</option>}
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    Patient conversation {conversation.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="message-thread" role="log" aria-live="polite" aria-relevant="additions">
            {loadError ? <p className="message-error" role="alert">{loadError}</p> : null}
            {messageArea()}
            <div ref={bottomRef} />
          </div>

          <div className="message-composer-area">
            {authStatus === "checking" ? (
              <p className="message-state">Checking your sign-in...</p>
            ) : null}
            {authStatus === "signed-out" ? (
              <p className="message-auth-prompt">
                Please log in to send us a message. <a href="/contact#login" onClick={openLogin}>Log In</a>
              </p>
            ) : null}
            {authStatus === "unavailable" ? (
              <p className="message-error" role="alert">
                Messaging is unavailable because Supabase is not configured. Add your project URL and public anon key.
              </p>
            ) : null}
            {authStatus === "error" ? (
              <p className="message-error" role="alert">{loadError || "We couldn't verify your account. Refresh the page and try again."}</p>
            ) : null}
            {authStatus === "signed-in" ? (
              <form className="message-composer" onSubmit={handleSend}>
                <textarea
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setSendSuccess("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Type a message..."
                  aria-label="Type a message"
                  rows={1}
                  maxLength={10000}
                  disabled={isSending || !conversationId && isStaff}
                />
                <button
                  type="submit"
                  aria-label="Send message"
                  title="Send message"
                  disabled={!draft.trim() || isSending || !conversationId && isStaff}
                >
                  {isSending ? <span className="send-spinner" aria-label="Sending" /> : <span aria-hidden="true">&#8594;</span>}
                </button>
              </form>
            ) : null}
            {sendError ? <p className="message-error" role="alert">{sendError}</p> : null}
            {sendSuccess ? <p className="message-success" role="status">{sendSuccess}</p> : null}
            {authStatus === "signed-in" ? (
              <p className="message-composer-note">Shift + Enter for a new line</p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
