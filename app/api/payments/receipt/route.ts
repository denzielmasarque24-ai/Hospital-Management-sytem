import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]!));

export async function GET(request: Request) {
  const client = await createSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Receipt service is unavailable." }, { status: 503 });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("paymentId");
  if (!id) return NextResponse.json({ error: "Payment reference is required." }, { status: 400 });

  const { data: attempt, error: attemptError } = await client.from("online_payments")
    .select("id,status,payment_method,amount,currency,provider_payment_id,bill_id,paid_at")
    .eq("id", id).eq("patient_id", user.id).maybeSingle();
  if (attemptError) {
    console.error("[Payments] Receipt payment lookup failed", { code: attemptError.code, message: attemptError.message, details: attemptError.details, hint: attemptError.hint });
    return NextResponse.json({ error: "Could not verify this payment." }, { status: 500 });
  }
  if (!attempt || attempt.status !== "paid" || !attempt.provider_payment_id) {
    return NextResponse.json({ error: "A verified receipt is not available for this payment." }, { status: 404 });
  }

  const [{ data: bill, error: billError }, { data: payment, error: paymentError }] = await Promise.all([
    client.from("patient_bills").select("bill_number,is_demo").eq("id", attempt.bill_id).eq("patient_id", user.id).maybeSingle(),
    client.from("patient_payments").select("receipt_number,paid_at,payment_date,is_demo,status,amount,payment_method,reference_number")
      .eq("external_reference", attempt.id).eq("patient_id", user.id).maybeSingle(),
  ]);
  if (billError || paymentError) {
    const error = billError || paymentError;
    console.error("[Payments] Receipt details lookup failed", { source: billError ? "patient bill" : "patient payment", code: error?.code, message: error?.message, details: error?.details, hint: error?.hint });
    return NextResponse.json({ error: "Could not verify receipt details." }, { status: 500 });
  }
  if (!bill || bill.is_demo !== false || !payment || payment.is_demo !== false || !["completed", "paid", "succeeded"].includes(String(payment.status).toLowerCase())) {
    return NextResponse.json({ error: "A verified receipt is not available for this payment." }, { status: 404 });
  }

  const filename = String(payment.receipt_number || "medwell-receipt").replace(/[^A-Za-z0-9_-]/g, "");
  const paidAt = payment.paid_at || payment.payment_date || attempt.paid_at;
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>MedWell payment receipt</title><style>body{font:16px Arial,sans-serif;color:#17324d;max-width:680px;margin:48px auto;padding:24px}h1{color:#0759c9}dl{display:grid;grid-template-columns:1fr 2fr;gap:12px;border-top:1px solid #dce7f0;padding-top:18px}dt{color:#62778b}dd{margin:0;font-weight:700}.verified{color:#087c51}</style><h1>MedWell Medical Hospital</h1><h2>Payment receipt</h2><p class="verified">Verified payment</p><dl><dt>Receipt number</dt><dd>${esc(payment.receipt_number)}</dd><dt>Bill</dt><dd>${esc(bill.bill_number)}</dd><dt>Amount paid</dt><dd>${esc(new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(payment.amount)))}</dd><dt>Method</dt><dd>${esc(payment.payment_method || attempt.payment_method)}</dd><dt>Paid at</dt><dd>${paidAt ? esc(new Date(paidAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })) : "Not recorded"} (Asia/Manila)</dd><dt>Provider reference</dt><dd>${esc(attempt.provider_payment_id)}</dd><dt>Status</dt><dd>Paid and verified</dd></dl><p>This receipt was generated after payment provider confirmation.</p></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="${filename || "medwell-receipt"}.html"`, "Cache-Control": "no-store" } });
}
