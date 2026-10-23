import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeCheckoutPaid, normalizePaymentFailure, normalizeRefund, paymentEnvironment, verifyPayMongoSignature } from "@/lib/payments/paymongo";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request) {
  const config=paymentEnvironment();
  if(!config) return NextResponse.json({error:"Webhook is not configured."},{status:503});
  const raw=await request.text();
  if(raw.length>1_000_000) return NextResponse.json({error:"Payload too large."},{status:413});
  if(!verifyPayMongoSignature(raw,request.headers.get("Paymongo-Signature"),config.webhook)) return NextResponse.json({error:"Invalid webhook signature."},{status:401});
  let event:any; try {event=JSON.parse(raw)} catch{return NextResponse.json({error:"Invalid JSON."},{status:400})}
  const eventId=event?.data?.id;
  const eventType=event?.data?.attributes?.type;
  if(typeof eventId!=="string"||typeof eventType!=="string") return NextResponse.json({error:"Invalid webhook event."},{status:400});
  if(event?.data?.attributes?.livemode!==false) return NextResponse.json({error:"Only verified test-mode webhook events are accepted."},{status:422});
  if(!["checkout_session.payment.paid","payment.failed","refund.succeeded"].includes(eventType)) return NextResponse.json({received:true,ignored:true});
  const normalized=eventType==="checkout_session.payment.paid"?normalizeCheckoutPaid(event):null;
  const failure=eventType==="payment.failed"?normalizePaymentFailure(event):null;
  const refund=eventType==="refund.succeeded"?normalizeRefund(event):null;
  if((eventType==="checkout_session.payment.paid"&&!normalized)||(eventType==="payment.failed"&&!failure)||(eventType==="refund.succeeded"&&!refund)) return NextResponse.json({error:"Payment or refund details are incomplete or unsupported."},{status:422});
  const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,config.serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=eventType==="payment.failed" ? await service.rpc("payment_process_failure",{
    p_event_id:eventId,p_payload:event,p_provider_payment_id:failure!.providerPaymentId,p_payment_intent_id:failure!.paymentIntentId,
    p_amount_cents:failure!.amountCents,p_currency:failure!.currency,p_method:failure!.method,p_livemode:failure!.livemode,
  }) : await service.rpc("payment_process_webhook",{
    p_event_id:eventId,p_event_type:eventType,p_payload:event,
    p_session_id:normalized?.sessionId??null,p_provider_payment_id:normalized?.providerPaymentId??refund?.providerPaymentId??null,
    p_amount_cents:normalized?.amountCents??refund?.amountCents??null,p_currency:normalized?.currency??refund?.currency??null,
    p_method:normalized?.method??null,p_livemode:normalized?.livemode??refund?.livemode??(event?.data?.attributes?.livemode===true),
  });
  if(error) {
    console.error("[Payments] Webhook validation failed",{code:error.code,message:error.message,details:error.details,hint:error.hint});
    return NextResponse.json({error:"Webhook could not be verified against the bill."},{status:422});
  }
  return NextResponse.json({received:true,result:data});
}
