"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, MessageCircle, PackageCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type Item = { id: string; type: string; title: string; body: string; related_conversation_id: string | null; is_read: boolean; created_at: string };
const hrefFor = (item: Item) => item.related_conversation_id ? `/admin/messages?conversation=${encodeURIComponent(item.related_conversation_id)}` : item.type.includes("appointment") ? "/admin/appointments" : item.type.includes("order") ? "/admin/orders" : "/admin/messages";
const timeFor = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function AdminNotificationCenter() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    const { data, error: queryError } = await supabase.from("admin_notifications").select("id, type, title, body, related_conversation_id, is_read, created_at").order("created_at", { ascending: false }).limit(200);
    if (queryError) setError(`${queryError.code ? `(${queryError.code}) ` : ""}${queryError.message}`);
    else { setItems((data ?? []) as Item[]); setError(""); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); if (!supabase) return; const channel = supabase.channel("admin-notification-center").on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, () => { void load(); }).subscribe(); return () => { void supabase?.removeChannel(channel); }; }, [load]);
  const markRead = async (item: Item) => {
    if (!supabase || item.is_read) return;
    const { error: updateError } = await supabase.from("admin_notifications").update({ is_read: true }).eq("id", item.id);
    if (updateError) { setError(`${updateError.code ? `(${updateError.code}) ` : ""}${updateError.message}`); return; }
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry));
  };
  return <section className="ad-card ad-notification-center"><div className="ad-card-header"><h2>All notifications</h2><span>{items.filter((item) => !item.is_read).length} unread</span></div>
    {error && <p className="ad-notification-error" role="alert">{error} <button onClick={() => void load()}>Retry</button></p>}
    {loading ? <p className="ad-notification-center-empty">Loading notifications…</p> : !items.length && !error ? <p className="ad-notification-center-empty">No notifications yet.</p> : <div className="ad-notification-center-list">{items.map((item) => { const Icon = item.type.includes("message") || item.type.includes("conversation") ? MessageCircle : item.type.includes("appointment") ? CalendarDays : PackageCheck; return <article className={`ad-notification-center-item${item.is_read ? "" : " unread"}`} key={item.id}><span className="ad-notification-icon"><Icon size={18}/></span><div><strong>{item.title}</strong><p>{item.body}</p><time>{timeFor(item.created_at)}</time></div><div className="ad-notification-center-actions"><Link href={hrefFor(item)} onClick={() => void markRead(item)}>Open</Link>{!item.is_read && <button onClick={() => void markRead(item)} aria-label="Mark as read"><Check size={15}/></button>}</div></article>; })}</div>}
  </section>;
}
