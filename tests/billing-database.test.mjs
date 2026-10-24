import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
let PGlite;
try { ({PGlite}=await import('../.tmp/clinical-db/node_modules/@electric-sql/pglite/dist/index.js')); }catch{}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('verified billing saves all five charge types atomically and rejects invalid, unapproved and duplicate charges', {skip:!PGlite&&'Install the optional local PostgreSQL engine; see docs/billing-validation.md'}, async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated;
   create table profiles(id uuid primary key references auth.users(id),role text);
   create function public.current_admin_role() returns text language sql stable security definer set search_path='' as $$select role from public.profiles where id=auth.uid()$$;
   create function public.can_manage_patient_area(p_area text) returns boolean language sql stable security definer set search_path='' as $$select p_area='billing' and coalesce(public.current_admin_role(),'') in ('ADMIN','SUPER_ADMIN','BILLING_STAFF')$$;
   create table products(id uuid primary key,name text,category text,price numeric,stock numeric,available boolean,updated_at timestamptz);
   create table services(id uuid primary key,name text);
   create table doctors(id uuid primary key,display_name text,is_demo boolean);
   create table hospital_rooms(id uuid primary key,is_demo boolean);
   create table patient_admissions(id uuid primary key,patient_id uuid,room_id uuid,doctor_id uuid,admitted_at timestamptz,discharged_at timestamptz,status text,is_demo boolean,demo_key text);
   create table patient_medical_records(id uuid primary key,patient_id uuid,doctor_id uuid,title text,result_status text,is_demo boolean,demo_key text,delivery_state text,reviewed_at timestamptz,released_at timestamptz);
   create table patient_bills(id uuid primary key default gen_random_uuid(),patient_id uuid,admission_id uuid,bill_number text,description text,total_amount numeric,approved_discount numeric,taxes_and_fees numeric,discount_reason text,external_reference uuid unique,is_demo boolean,status text,payment_approved_at timestamptz,payment_approved_by uuid,issued_at timestamptz default now());
   create table patient_medical_charges(id uuid primary key default gen_random_uuid(),patient_id uuid,admission_id uuid,bill_id uuid,item_name text,category text,quantity numeric,unit_price numeric,recorded_by uuid,inventory_product_id uuid,supporting_reason text,service_id uuid,professional_doctor_id uuid,consultation_record_id uuid,service_date date,service_period_start date,service_period_end date,is_demo boolean);
   create table patient_payments(id uuid,bill_id uuid,patient_id uuid,is_demo boolean,status text);
   create table inventory_adjustments(id uuid default gen_random_uuid(),product_id uuid,quantity numeric,note text,adjusted_by uuid);
   create table online_payments(bill_id uuid,status text);
   insert into auth.users values ${[1,2,3,4,5].map(n=>`('${id(n)}')`).join(',')};
   insert into profiles values ('${id(1)}','PATIENT'),('${id(2)}','PATIENT'),('${id(3)}','BILLING_STAFF'),('${id(4)}','ADMIN'),('${id(5)}','SALES_STAFF');
   insert into products values ('${id(11)}','Fixture Supply','Medical Supply',25,100,true,now());
   insert into services values ('${id(12)}','Fixture Service');
   insert into doctors values ('${id(10)}','Fixture Doctor',false);
   insert into hospital_rooms values ('${id(13)}',false);
   insert into patient_admissions values ('${id(20)}','${id(1)}','${id(13)}','${id(10)}','2026-10-18 01:00:00+00','2026-10-20 03:00:00+00','discharged',false,null),('${id(21)}','${id(1)}','${id(13)}','${id(10)}','2026-10-18 01:00:00+00','2026-10-20 03:00:00+00','discharged',true,'demo');
   insert into patient_medical_records values ('${id(15)}','${id(1)}','${id(10)}','Verified care','verified',false,null,'legacy',null,null),('${id(16)}','${id(1)}','${id(10)}','Demo care','verified',true,'demo','legacy',null,null),('${id(17)}','${id(1)}','${id(10)}','Unreleased care','verified',false,null,'draft',null,null);
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261218000000_verified_billing_charges.sql',import.meta.url),'utf8'));
  const user=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(n)]);await db.exec('set role authenticated');};
  const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  const base={description:'Approved fixture',quantity:'1',unit_price:'150.00',supporting_reason:'Approved price schedule and verified delivery reference',service_date:'2026-10-20'};
  await user(3);await assert.rejects(()=>rpc('billing_approve_charge',[id(30),id(1),{...base,category:'other'}]),/administrator/);
  await user(4);
  const quotes=[{...base,category:'hospital_service',service_id:id(12),care_record_id:id(15)}, {...base,category:'consultation',care_record_id:id(15),doctor_id:id(10),unit_price:'250.00'}, {...base,category:'room',admission_id:id(20),period_start:'2026-10-18',period_end:'2026-10-20',quantity:'3',unit_price:'1000.00'}, {...base,category:'other',quantity:'0.125',unit_price:'800.00'}];
  for(let i=0;i<quotes.length;i++)await rpc('billing_approve_charge',[id(30+i),id(1),quotes[i]]);
  assert.equal(await rpc('billing_approve_charge',[id(30),id(1),quotes[0]]),id(30));
  await assert.rejects(()=>rpc('billing_approve_charge',[id(30),id(1),{...quotes[0],unit_price:'1.00'}]),/already in use/);
  await assert.rejects(()=>rpc('billing_approve_charge',[id(40),id(1),{...quotes[2],admission_id:id(21)}]),/genuine admission/);
  await assert.rejects(()=>rpc('billing_approve_charge',[id(40),id(1),{...quotes[0],care_record_id:id(16)}]),/verified care/);
  await assert.rejects(()=>rpc('billing_approve_charge',[id(40),id(1),{...quotes[0],care_record_id:id(17)}]),/verified care/);
  const options=await rpc('billing_charge_options',[id(1)]);
  const product={description:'Fixture Supply',category:'medical_supply',quantity:'2',unit_price:'25.00',inventory_product_id:id(11),service_date:'2026-10-20'};
  const lines=[product,...options.approvals.sort((a,b)=>a.id.localeCompare(b.id)).map(q=>({description:q.description,category:q.category,quantity:q.quantity,unit_price:q.unit_price,billing_authorization_id:q.id,service_id:q.service_id,doctor_id:q.doctor_id,consultation_record_id:q.consultation_record_id,supporting_reason:q.supporting_reason,service_date:q.service_date,period_start:q.period_start,period_end:q.period_end}))];
  const save=(items,reference=id(50),bill=null,finalize=false,patient=id(1))=>rpc('billing_save_patient_bill',[bill,reference,patient,null,items,50,'Approved discount',10,finalize]);
  await user(5);await assert.rejects(()=>save(lines),/Billing permission/);
  await user(3);
  const invalid=[
   [{...product,description:''},'description'],[{...product,quantity:'0'},'quantity'],[{...product,quantity:'-1'},'quantity'],[{...product,quantity:'1.1234'},'quantity'],[{...product,quantity:'0.125'},'quantity'],
   [{...product,unit_price:'NaN'},'unitPrice'],[{...product,unit_price:'25.001'},'unitPrice'],[{...product,unit_price:'24.99'},'unitPrice'],[{...product,inventory_product_id:null},'productId'],
   [{...lines[1],billing_authorization_id:null},'authorizationId'],[{...lines[4],supporting_reason:''},'reason'],[{...lines[2],doctor_id:id(99)},'consultationRecordId'],
  ];
  for(const [item,field] of invalid)await assert.rejects(()=>save([item]),error=>JSON.parse(error.detail).field===field&&JSON.parse(error.detail).item_index===0);
  await assert.rejects(()=>save([lines[1]],id(51),null,false,id(2)),/authorization/);
  const draft=await save(lines);assert.equal(Number(draft.total_amount),3510);
  assert.deepEqual(await save(lines),draft);
  await assert.rejects(()=>save([{...product,quantity:'1'}]),/different payload/);
  await db.exec('reset role');assert.equal(Number((await db.query('select stock from products')).rows[0].stock),100);assert.equal((await db.query('select * from patient_medical_charges')).rows.length,5);await user(3);
  const finalized=await save(lines,id(52),draft.bill_id,true);assert.equal(finalized.finalized,true);assert.deepEqual(await save(lines,id(52),draft.bill_id,true),finalized);
  await db.exec('reset role');assert.equal(Number((await db.query('select stock from products')).rows[0].stock),98);assert.equal((await db.query('select * from inventory_adjustments')).rows.length,1);assert.equal((await db.query('select * from patient_medical_charges')).rows.length,5);await user(4);
  await rpc('billing_approve_charge',[id(41),id(1),quotes[1]]);await rpc('billing_approve_charge',[id(42),id(1),quotes[2]]);
  await user(3);
  await assert.rejects(()=>save([product,{...lines[2],billing_authorization_id:id(41)}],id(60),null,true),/already has a saved professional fee/);
  await assert.rejects(()=>save([{...lines[3],billing_authorization_id:id(42)}],id(61)),/overlaps an existing accommodation/);
  await assert.rejects(()=>save([lines[4]],id(62)),/already charged/);
  await db.exec('reset role');assert.equal((await db.query('select * from patient_bills')).rows.length,1);assert.equal((await db.query('select * from inventory_adjustments')).rows.length,1);assert.equal(Number((await db.query('select stock from products')).rows[0].stock),98);
  assert.equal((await db.query('select * from patient_billing_authorizations')).rows.length,6);
  await user(1);
  assert.equal((await db.query('select * from patient_billing_authorizations')).rows.length,0);
  await assert.rejects(()=>db.query('update patient_billing_authorizations set unit_price=1'),/permission denied/);
  await assert.rejects(()=>db.query('select * from patient_billing_save_requests'),/permission denied/);
 }finally{await db.close();}
});
