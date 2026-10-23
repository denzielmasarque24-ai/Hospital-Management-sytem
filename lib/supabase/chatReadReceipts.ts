import { supabase } from "@/lib/supabase/client";

type SupabaseDiagnostic = { name?: string; code?: string; message?: string; details?: string; hint?: string; status?: number; statusCode?: number };
const describeError = (error: unknown) => {
  if (!error || typeof error !== "object") return { message: String(error) };
  const value = error as SupabaseDiagnostic;
  return {
    name: value.name,
    code: value.code,
    message: value.message,
    details: value.details,
    hint: value.hint,
    status: value.status ?? value.statusCode,
  };
};

export async function markConversationMessagesRead(conversationId: string, audience: "patient" | "admin") {
  if (!supabase || !conversationId) return;
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      if (sessionError.name !== "AuthSessionMissingError") {
        console.error("[ChatReadReceipts] Could not read the auth session", { operation: "auth.getSession", ...describeError(sessionError) });
      }
      return;
    }
    if (!session) return;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError?.name === "AuthSessionMissingError" || (!authError && !user)) return;
    if (authError || !user) {
      console.error("[ChatReadReceipts] Could not verify the reader", { operation: "auth.getUser", ...describeError(authError ?? new Error("Could not verify the authenticated user")) });
      return;
    }

  const receivedRoles = audience === "patient"
    ? ["ADMIN", "STAFF", "admin", "staff"]
    : ["PATIENT", "patient"];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data: messages, error: messagesError } = await supabase.from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .neq("sender_id", user.id)
      .in("sender_role", receivedRoles)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (messagesError) {
      console.error("[ChatReadReceipts] Could not load received messages", { operation: "messages.select(received)", ...describeError(messagesError) });
      return;
    }
    if (!messages?.length) return;

    const ids = messages.map((message) => message.id);
    const { data: existing, error: existingError } = await supabase.from("message_read_receipts")
      .select("message_id").eq("user_id", user.id).in("message_id", ids);
    if (existingError) {
      console.error("[ChatReadReceipts] Could not check read receipts", { operation: "message_read_receipts.select(user, messages)", ...describeError(existingError) });
      return;
    }
    const read = new Set((existing ?? []).map((receipt) => receipt.message_id));
    const unread = ids.filter((id) => !read.has(id));
    if (unread.length) {
      const { error: insertError } = await supabase.from("message_read_receipts")
        .upsert(unread.map((message_id) => ({ message_id, user_id: user.id })), {
          onConflict: "message_id,user_id",
          ignoreDuplicates: true,
        });
      if (insertError) {
        console.error("[ChatReadReceipts] Could not mark received messages read", { operation: "message_read_receipts.upsert", ...describeError(insertError) });
        return;
      }
      if (typeof window !== "undefined") window.dispatchEvent(new Event("mediwell:chat-updated"));
    }
    if (messages.length < pageSize) return;
  }
  } catch (error) {
    console.error("[ChatReadReceipts] Unexpected read receipt failure", { operation: "markConversationMessagesRead", ...describeError(error) });
  }
}
