"use client";

import { useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase/client";

const loginEventName = "mediwell:open-login";

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
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

    supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthStatus("error");
        setLoadError("We couldn't verify your account. Refresh the page and try again.");
        return;
      }
      applySession({ user: data.user });
    }).catch(() => {
      if (!active) return;
      setAuthStatus("error");
      setLoadError("We couldn't verify your account. Refresh the page and try again.");
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
        setLoadError("Your conversations couldn't be loaded. Confirm the messaging database is set up and try again.");
      } else {
        const rows = isStaff ? result.data ?? [] : result.data ? [result.data] : [];
        setConversations(rows);
        setConversationId((current) => {
          if (current && rows.some((conversation) => conversation.id === current)) return current;
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
        .select("id, conversation_id, sender_id, sender_role, message, created_at, read_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (error) {
        setLoadError("Messages couldn't be loaded. Confirm the messaging database is set up and try again.");
      } else {
        setMessages(data ?? []);
        setLoadError("");
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
    try {
      let activeConversationId = conversationId;
      if (!activeConversationId && !isStaff) {
        const conversation = await startConversation();
        activeConversationId = conversation.id;
        setConversationId(conversation.id);
        setConversations((current) => [conversation, ...current]);
      }

      if (!activeConversationId) {
        setSendError("Select a conversation before replying.");
        return;
      }

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          sender_role: isStaff ? "staff" : "patient",
          message: messageText,
        })
        .select("id, conversation_id, sender_id, sender_role, message, created_at, read_at")
        .single();

      if (error) throw error;
      setMessages((current) => [...current, data]);
      setDraft("");
    } catch {
      setSendError("Your message couldn't be saved. Please check your connection and try again.");
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
              <p>Hello! Welcome to MediWell Hospital. How can we help you today?</p>
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
      const isHospitalMessage = message.sender_role === "staff";
      return (
        <div
          className={`chat-message ${isOwnMessage ? "own-message" : "hospital-message"}`}
          key={message.id}
        >
          <span className="message-sender">
            {isHospitalMessage ? "MediWell Hospital" : isStaff ? "Patient" : "You"}
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
        <div className="message-page-heading">
          <p className="message-eyebrow">Patient support</p>
          <h1>Send Us a Message</h1>
          <p>Have a question or need assistance? Send us a message, and our team will get back to you.</p>
        </div>

        <section className="message-panel" aria-label="MediWell Hospital messaging">
          <header className="message-panel-header">
            <span className="message-hospital-icon" aria-hidden="true">+</span>
            <div className="message-hospital-copy">
              <h2>MediWell Hospital</h2>
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
                  onChange={(event) => setDraft(event.target.value)}
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
            {authStatus === "signed-in" ? (
              <p className="message-composer-note">Shift + Enter for a new line</p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
