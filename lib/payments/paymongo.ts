import { createHmac, timingSafeEqual } from "node:crypto";

export type PayMethod = "gcash" | "paymaya" | "card";
export type PayMongoCheckout = { id: string; attributes?: { checkout_url?: string; expires_at?: string | number; payment_intent?: { id?: string }; payments?: unknown[] } };

export function paymentEnvironment() {
  const secret = process.env.PAYMONGO_TEST_SECRET_KEY;
  const webhook = process.env.PAYMONGO_TEST_WEBHOOK_SECRET;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const enabledMethods = (process.env.PAYMONGO_ENABLED_METHODS||"").split(",").map(value=>value.trim().toLowerCase()).filter((value):value is PayMethod=>value==="gcash"||value==="paymaya"||value==="card");
  const mode = process.env.PAYMONGO_MODE;
  let origin="";
  try {const url=new URL(appUrl||"");if(url.protocol!=="https:"&&url.hostname!=="localhost"&&url.hostname!=="127.0.0.1")return null;origin=url.origin;} catch{return null}
  if (mode !== "test" || !secret?.startsWith("sk_test_") || !webhook || !serviceRole || !supabaseUrl || !enabledMethods.length) return null;
  return { secret, webhook, serviceRole, supabaseUrl, origin, enabledMethods };
}

export async function createPayMongoCheckout(input: { paymentId: string; billNumber: string; amountCents: number; method: PayMethod; idempotencyKey: string; origin: string; secret: string }) {
  const body = {
    data: { attributes: {
      line_items: [{ currency: "PHP", amount: input.amountCents, name: `MedWell bill ${input.billNumber}`, quantity: 1 }],
      payment_method_types: [input.method],
      description: `MedWell Medical Hospital bill ${input.billNumber}`,
      success_url: `${input.origin}/patient/billing?payment=${input.paymentId}`,
      cancel_url: `${input.origin}/patient/billing?payment_cancelled=${input.paymentId}`,
      reference_number: input.paymentId,
      metadata: { online_payment_id: input.paymentId, bill_number: input.billNumber },
    } },
  };
  const response = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.secret}:`).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.errors?.[0]?.detail || "Payment provider could not create checkout.");
  const session = json?.data as PayMongoCheckout | undefined;
  const url = session?.attributes?.checkout_url;
  if (!session?.id || !url || !/^https:\/\//i.test(url)) throw new Error("Payment provider returned incomplete checkout details.");
  const expiresAt = session.attributes?.expires_at ? new Date(typeof session.attributes.expires_at === "number" ? session.attributes.expires_at * 1000 : session.attributes.expires_at).toISOString() : null;
  return { sessionId: session.id, paymentIntentId: session.attributes?.payment_intent?.id ?? null, url, expiresAt };
}

export async function expirePayMongoCheckout(input: { sessionId: string; secret: string }) {
  const headers = { Authorization: `Basic ${Buffer.from(`${input.secret}:`).toString("base64")}`, "Content-Type": "application/json" };
  const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(input.sessionId)}/expire`, {
    method: "POST", headers, body: JSON.stringify({}), cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (response.ok) return String(json?.data?.attributes?.status || "");
  // The expire endpoint rejects sessions that have a paid or in-flight payment.
  // Read the provider state; never mark an attempt terminal based on the redirect.
  const lookup = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(input.sessionId)}`, { headers, cache: "no-store" });
  const current = await lookup.json().catch(() => null);
  if (!lookup.ok) throw new Error(json?.errors?.[0]?.detail || current?.errors?.[0]?.detail || "Could not verify checkout session state.");
  return String(current?.data?.attributes?.status || "");
}

export function verifyPayMongoSignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map(part => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));
  const timestamp = parts.t;
  const supplied = parts.te;
  if (!timestamp || !supplied || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(supplied, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeCheckoutPaid(event: any) {
  const data = event?.data?.attributes?.data;
  const session = data?.attributes;
  const payment = Array.isArray(session?.payments) ? session.payments.find((item: any) => item?.attributes?.status === "paid") : null;
  const paymentAttributes = payment?.attributes;
  const sourceType = paymentAttributes?.source?.type ?? paymentAttributes?.payment_method?.type ?? session?.payment_method_types?.[0];
  if (!data?.id || !payment?.id || !Number.isSafeInteger(paymentAttributes?.amount) || paymentAttributes.amount <= 0) return null;
  if (typeof paymentAttributes?.currency !== "string" || paymentAttributes.currency.toUpperCase() !== "PHP" || !["gcash", "paymaya", "card"].includes(sourceType)) return null;
  return { sessionId: String(data.id), providerPaymentId: String(payment.id), amountCents: Number(paymentAttributes.amount), currency: "PHP", method: sourceType as PayMethod, livemode: event?.data?.attributes?.livemode === true };
}

export function normalizePaymentFailure(event: any) {
  const payment = event?.data?.attributes?.data;
  const attrs = payment?.attributes;
  const method = attrs?.source?.type ?? attrs?.payment_method?.type;
  if (payment?.type !== "payment" || attrs?.status !== "failed" || typeof payment.id !== "string" ||
      typeof attrs?.payment_intent_id !== "string" || !Number.isSafeInteger(attrs?.amount) || attrs.amount <= 0 ||
      typeof attrs?.currency !== "string" || attrs.currency.toUpperCase() !== "PHP" || !["gcash", "paymaya", "card"].includes(method)) return null;
  return { providerPaymentId: payment.id, paymentIntentId: attrs.payment_intent_id, amountCents: Number(attrs.amount), currency: "PHP", method: method as PayMethod, livemode: event?.data?.attributes?.livemode === true };
}

export function normalizeRefund(event: any) {
  const refund=event?.data?.attributes?.data;
  const attrs=refund?.attributes;
  if(refund?.type!=="refund"||typeof refund?.id!=="string"||attrs?.status!=="succeeded"||typeof attrs?.payment_id!=="string"||!Number.isSafeInteger(attrs?.amount)||attrs.amount<=0||typeof attrs?.currency!=="string"||attrs.currency.toUpperCase()!=="PHP") return null;
  return {refundId:String(refund.id),providerPaymentId:String(attrs.payment_id),amountCents:Number(attrs.amount),currency:"PHP",livemode:event?.data?.attributes?.livemode===true};
}
