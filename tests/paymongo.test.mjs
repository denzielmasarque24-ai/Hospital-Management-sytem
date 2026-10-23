import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';

const require=createRequire(import.meta.url),ts=require('typescript');
const exports={};
const source=ts.transpileModule(readFileSync(new URL('../lib/payments/paymongo.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let fetchRequest;
const testFetch=async(url,options)=>{fetchRequest={url,options};return{ok:true,json:async()=>({data:{id:'cs_fixture',attributes:{checkout_url:'https://checkout.paymongo.test/session'}}})}};
vm.runInNewContext(source,{exports,require,Buffer,Date,URL,process,fetch:testFetch});
const paymongo=exports;

test('test payment configuration requires test credentials and explicit activated methods',()=>{
  const original={mode:process.env.PAYMONGO_MODE,secret:process.env.PAYMONGO_TEST_SECRET_KEY,webhook:process.env.PAYMONGO_TEST_WEBHOOK_SECRET,service:process.env.SUPABASE_SERVICE_ROLE_KEY,url:process.env.NEXT_PUBLIC_APP_URL,supabase:process.env.NEXT_PUBLIC_SUPABASE_URL,methods:process.env.PAYMONGO_ENABLED_METHODS};
  try {
    process.env.PAYMONGO_MODE='test';process.env.PAYMONGO_TEST_SECRET_KEY='sk_test_fixture';process.env.PAYMONGO_TEST_WEBHOOK_SECRET='whsec_fixture';process.env.SUPABASE_SERVICE_ROLE_KEY='service_fixture';process.env.NEXT_PUBLIC_APP_URL='https://medwell.example';process.env.NEXT_PUBLIC_SUPABASE_URL='https://project.supabase.co';process.env.PAYMONGO_ENABLED_METHODS='gcash,card';
    assert.deepEqual(JSON.parse(JSON.stringify(paymongo.paymentEnvironment().enabledMethods)),['gcash','card']);
    process.env.PAYMONGO_MODE='live';assert.equal(paymongo.paymentEnvironment(),null);
    process.env.PAYMONGO_MODE='test';process.env.PAYMONGO_ENABLED_METHODS='';assert.equal(paymongo.paymentEnvironment(),null);
  } finally {
    for(const [key,value] of Object.entries({PAYMONGO_MODE:original.mode,PAYMONGO_TEST_SECRET_KEY:original.secret,PAYMONGO_TEST_WEBHOOK_SECRET:original.webhook,SUPABASE_SERVICE_ROLE_KEY:original.service,NEXT_PUBLIC_APP_URL:original.url,NEXT_PUBLIC_SUPABASE_URL:original.supabase,PAYMONGO_ENABLED_METHODS:original.methods})) value===undefined?delete process.env[key]:process.env[key]=value;
  }
});

test('webhook verifier validates the exact raw body and rejects stale or altered signatures',()=>{
  const raw='{"data":{"id":"evt_fixture"}}',timestamp=String(Math.floor(Date.now()/1000)),secret='whsec_fixture';
  const signature=createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');
  assert.equal(paymongo.verifyPayMongoSignature(raw,`t=${timestamp},te=${signature},li=unused`,secret),true);
  assert.equal(paymongo.verifyPayMongoSignature(`${raw} `,`t=${timestamp},te=${signature}`,secret),false);
  assert.equal(paymongo.verifyPayMongoSignature(raw,`t=${Number(timestamp)-600},te=${signature}`,secret),false);
});

test('normalizes paid GCash, Maya, and card checkout sessions, failed payments, and succeeded PHP refunds',()=>{
  const event={data:{id:'evt_fixture',attributes:{type:'checkout_session.payment.paid',livemode:false,data:{id:'cs_fixture',attributes:{payments:[{id:'pay_fixture',attributes:{status:'paid',amount:12500,currency:'PHP',source:{type:'paymaya'}}}]}}}}};
  assert.equal(paymongo.normalizeCheckoutPaid(event).method,'paymaya');
  event.data.attributes.data.attributes.payments[0].attributes.source.type='card';
  assert.equal(paymongo.normalizeCheckoutPaid(event).method,'card');
  const failed={data:{id:'evt_failed',attributes:{type:'payment.failed',livemode:false,data:{id:'pay_failed',type:'payment',attributes:{status:'failed',amount:12500,currency:'PHP',payment_intent_id:'pi_fixture',source:{type:'gcash'}}}}}};
  assert.equal(paymongo.normalizePaymentFailure(failed).paymentIntentId,'pi_fixture');
  failed.data.attributes.data.attributes.amount=0;
  assert.equal(paymongo.normalizePaymentFailure(failed),null);
  const refund={data:{id:'evt_refund',attributes:{type:'refund.succeeded',livemode:false,data:{id:'ref_fixture',type:'refund',attributes:{payment_id:'pay_fixture',amount:500,currency:'PHP',status:'succeeded'}}}}};
  assert.equal(paymongo.normalizeRefund(refund).amountCents,500);
  refund.data.attributes.data.attributes.status='pending';
  assert.equal(paymongo.normalizeRefund(refund),null);
});

test('checkout uses server-calculated centavos, selected method and stable provider idempotency',async()=>{
  fetchRequest=null;
  const result=await paymongo.createPayMongoCheckout({paymentId:'payment-id',billNumber:'MW-123',amountCents:12345,method:'gcash',idempotencyKey:'medwell-checkout-key',origin:'https://medwell.example',secret:'sk_test_fixture'});
  assert.equal(result.sessionId,'cs_fixture');
  assert.equal(fetchRequest.url,'https://api.paymongo.com/v2/checkout_sessions');
  assert.equal(fetchRequest.options.headers['Idempotency-Key'],'medwell-checkout-key');
  const body=JSON.parse(fetchRequest.options.body).data.attributes;
  assert.equal(body.line_items[0].amount,12345);
  assert.deepEqual(JSON.parse(JSON.stringify(body.payment_method_types)),['gcash']);
  assert.equal(body.reference_number,'payment-id');
});

test('provider checkout expiry uses PayMongo server state, not the patient return URL',async()=>{
  fetchRequest=null;
  await paymongo.expirePayMongoCheckout({sessionId:'cs_fixture',secret:'sk_test_fixture'});
  assert.equal(fetchRequest.url,'https://api.paymongo.com/v1/checkout_sessions/cs_fixture/expire');
  assert.equal(fetchRequest.options.method,'POST');
});

test('payment migration uses medical charges without the absent bill-items or refunded-amount columns',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20261202000000_charge_based_payments_and_bill_approval.sql',import.meta.url),'utf8');
  assert.match(migration,/public\.patient_medical_charges/);
  assert.doesNotMatch(migration,/patient_bill_items|refunded_amount/);
  assert.match(migration,/payment_approved_at/);
  assert.match(migration,/payment_process_failure/);
  assert.match(migration,/on conflict\(provider,provider_event_id\) do nothing/);
  assert.match(migration,/v_online\.status not in \('pending','failed'\)/);
  assert.match(migration,/round\(v_total-v_paid,2\)<>v_online\.amount/);
  const route=readFileSync(new URL('../app/api/payments/webhook/route.ts',import.meta.url),'utf8');
  assert.match(route,/Only verified test-mode webhook events are accepted/);
});

test('partial real checkout validates amount against the authenticated outstanding balance and reconciles by webhook',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20261207000000_partial_patient_checkout.sql',import.meta.url),'utf8');
  const checkout=migration.slice(migration.indexOf('create or replace function public.payment_prepare_checkout_amount'),migration.indexOf('-- Reconcile partial amounts'));
  const webhook=migration.slice(migration.indexOf('create or replace function public.payment_process_webhook'));
  assert.match(checkout,/auth\.uid\(\)/);
  assert.match(checkout,/b\.patient_id=auth\.uid\(\)/);
  assert.match(checkout,/v_bill\.is_demo is distinct from false/);
  assert.match(checkout,/v_amount>v_due/);
  assert.match(checkout,/payment_approved_at is null/);
  assert.match(webhook,/round\(v_total-v_paid,2\)<v_online\.amount/);
  assert.match(webhook,/then 'paid' else 'partial' end/);
  assert.match(migration,/grant execute on function public\.payment_prepare_checkout_amount\(uuid,text,numeric\) to authenticated/);
  assert.match(migration,/grant execute on function public\.payment_process_webhook[\s\S]*?to service_role/);
});

test('demo payment ledger is preserved while patient simulation is disabled',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20261203000000_demo_payment_simulations.sql',import.meta.url),'utf8');
  assert.match(migration,/create table if not exists public\.demo_payment_simulations/);
  assert.match(migration,/idempotency_key uuid not null/);
  assert.doesNotMatch(migration,/\brequest_key\b|\bis_demo boolean not null default true/);
  assert.match(migration,/b\.patient_id=v_patient_id/);
  assert.match(migration,/v_bill\.is_demo is distinct from true/);
  assert.match(migration,/for update/);
  assert.match(migration,/grant select on public\.demo_payment_simulations to authenticated/);
  assert.match(migration,/grant execute on function public\.create_demo_payment_simulation\(uuid,numeric,text,uuid\) to authenticated/);
  assert.match(migration,/public\.patient_payments/);
  assert.doesNotMatch(migration,/insert into public\.(patient_payments|online_payments)/);
  const balanceMigration=readFileSync(new URL('../supabase/migrations/20261204000000_demo_payment_balance_from_charges.sql',import.meta.url),'utf8');
  assert.match(balanceMigration,/sum\(c\.quantity\*c\.unit_price\)/);
  assert.match(balanceMigration,/c\.is_demo is true/);
  assert.match(balanceMigration,/not exists \([\s\S]*demo_payment_simulations/);
  assert.match(balanceMigration,/for update/);
  assert.match(balanceMigration,/notify pgrst,'reload schema'/i);
  const alignedMigration=readFileSync(new URL('../supabase/migrations/20261205000000_align_demo_payment_simulation_schema.sql',import.meta.url),'utf8');
  assert.match(alignedMigration,/drop function if exists public\.create_demo_payment_simulation/);
  assert.match(alignedMigration,/p_idempotency_key uuid/);
  assert.match(alignedMigration,/s\.idempotency_key=p_idempotency_key/);
  assert.doesNotMatch(alignedMigration,/s\.request_key|insert into public\.demo_payment_simulations[^;]*request_key/);
  const disabled=readFileSync(new URL('../supabase/migrations/20261208000000_disable_patient_online_checkout.sql',import.meta.url),'utf8');
  assert.match(disabled,/revoke all on function public\.payment_prepare_checkout_amount\(uuid, text, numeric\)\s+from public, anon, authenticated/i);
  assert.match(disabled,/revoke all on function public\.create_demo_payment_simulation\(uuid, numeric, text, uuid\)\s+from public, anon, authenticated/i);
  const queries=readFileSync(new URL('../lib/patient/queries.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(queries,/demo_payment_simulations/);
  assert.doesNotMatch(queries,/from\('online_payments'\)/);
  assert.match(queries,/patient_bills[\s\S]*?eq\('is_demo',false\)/);
  assert.match(queries,/patient_medical_charges[\s\S]*?eq\('is_demo',false\)[\s\S]*?in\('bill_id',billIds\)/);
  assert.match(queries,/patient_payments[\s\S]*?eq\('is_demo',false\)[\s\S]*?in\('bill_id',billIds\)/);
  const billingView=readFileSync(new URL('../components/patient/PatientBillingContent.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(billingView,/PatientBillPaymentButton|PatientPaymentStatus|\/api\/payments|Pay Now|GCash|Maya|Credit\/Debit Card|checkout_url/);
});

test('real patient checkout endpoint is disabled and existing payment webhooks remain available',()=>{
  const checkout=readFileSync(new URL('../app/api/payments/checkout/route.ts',import.meta.url),'utf8');
  const demo=readFileSync(new URL('../app/api/payments/demo/route.ts',import.meta.url),'utf8');
  const webhook=readFileSync(new URL('../app/api/payments/webhook/route.ts',import.meta.url),'utf8');
  assert.match(checkout,/status:\s*410/);
  assert.match(demo,/status:\s*410/);
  assert.match(webhook,/payment_process_webhook/);
});
