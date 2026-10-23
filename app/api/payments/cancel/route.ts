import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { expirePayMongoCheckout, paymentEnvironment } from "@/lib/payments/paymongo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = paymentEnvironment();
  if (!config) return NextResponse.json({ error: "Online payments are not configured for test mode." }, { status: 503 });
  if (request.headers.get("origin") !== config.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userClient = await createSupabaseServerClient();
  if (!userClient) return NextResponse.json({ error: "Payment service is unavailable." }, { status: 503 });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid cancellation request." }, { status: 400 }); }
  const paymentId = typeof (body as { paymentId?: unknown })?.paymentId === "string" ? (body as { paymentId: string }).paymentId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) return NextResponse.json({ error: "Invalid payment reference." }, { status: 400 });

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, config.serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: attempt, error: lookupError } = await userClient.from("online_payments").select("id,status,checkout_session_id").eq("id", paymentId).eq("patient_id", user.id).maybeSingle();
  if (lookupError) {
    console.error("[Payments] Cancellation attempt lookup failed", { code: lookupError.code, message: lookupError.message, details: lookupError.details, hint: lookupError.hint });
    return NextResponse.json({ error: "Could not verify this payment attempt." }, { status: 500 });
  }
  if (!attempt) return NextResponse.json({ error: "Payment attempt not found." }, { status: 404 });
  if (["paid", "completed", "refunded"].includes(attempt.status)) return NextResponse.json({ status: attempt.status });
  if (!["pending", "failed"].includes(attempt.status) || !attempt.checkout_session_id) return NextResponse.json({ error: "This checkout cannot be cancelled now." }, { status: 409 });

  try {
    const providerStatus = await expirePayMongoCheckout({ sessionId: attempt.checkout_session_id, secret: config.secret });
    if (providerStatus !== "expired") return NextResponse.json({ status: "pending", message: "The provider still has this checkout open or a payment is processing. Refresh payment status before retrying." }, { status: 409 });
    const { error: updateError } = await service.rpc("payment_mark_expired", { p_payment_id: attempt.id, p_final_status: "cancelled" });
    if (updateError) throw updateError;
    return NextResponse.json({ status: "cancelled" }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error("[Payments] Checkout cancellation could not be verified", { message: cause instanceof Error ? cause.message : String(cause) });
    return NextResponse.json({ error: "Could not confirm that PayMongo closed this checkout. The payment remains pending." }, { status: 502 });
  }
}
