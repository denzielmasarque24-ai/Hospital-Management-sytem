import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const doctorId='22222222-2222-4222-8222-222222222222',serviceId='11111111-1111-4111-8111-111111111111';
const flat=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flat):[node,...flat(node.props?.children)];
function load(file,dependencies,globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,URLSearchParams,console:{error(){}},require:name=>name in dependencies?dependencies[name]:require(name),...globals});return exports;
}

test('appointment page validates and preselects the requested available doctor UUID',async()=>{
 const page=load('../app/(app)/(website)/appointment/page.tsx',{
   '@/components/appointments/AppointmentForm':{AppointmentForm:'booking-form'},
   '@/lib/supabase/server':{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'patient'}}})}})},
   '@/lib/services/public-service':{getPublicServices:async()=>[{id:serviceId,slug:'test-service'}],getPublicDoctors:async()=>[{id:doctorId,available:true}],getPublicContact:async()=>null},
 });
 let nodes=flat(await page.default({searchParams:Promise.resolve({doctor:doctorId})}));
 let form=nodes.find(node=>node.type==='booking-form');assert.equal(form.props.defaultDoctorId,doctorId);
 nodes=flat(await page.default({searchParams:Promise.resolve({doctor:'unavailable-or-invalid'})}));
 form=nodes.find(node=>node.type==='booking-form');assert.equal(form.props.defaultDoctorId,'');assert.equal(form.props.requestedDoctorUnavailable,true);
});

test('signed-out appointment redirect preserves the doctor selection in next',async()=>{
 const page=load('../app/(app)/(website)/appointment/page.tsx',{
   '@/components/appointments/AppointmentForm':{AppointmentForm:'booking-form'},
   '@/lib/supabase/server':{createSupabaseServerClient:async()=>null},
   '@/lib/services/public-service':{},
   'next/navigation':{redirect:url=>{throw Object.assign(new Error('redirect'),{url});}},
 });
 await assert.rejects(page.default({searchParams:Promise.resolve({doctor:doctorId})}),error=>new URL(error.url,'https://example.invalid').searchParams.get('next')===`/appointment?doctor=${doctorId}`);
});

test('booking form uses the validated default doctor without changing available options',()=>{
 const form=load('../components/appointments/AppointmentForm.tsx',{
   react:{useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial}),useEffect(){}},
   'next/navigation':{useRouter:()=>({push(){}})},
 });
 const nodes=flat(form.AppointmentForm({services:[{id:serviceId,name:'Existing service'}],doctors:[{id:doctorId,display_name:'Existing doctor'}],defaultDoctorId:doctorId}));
 const select=nodes.find(node=>node.type==='select'&&node.props.name==='doctorId');assert.equal(select.props.value,doctorId);
 assert(flat(select).some(node=>node.type==='option'&&node.props.value===doctorId));
});

function api({duplicate=false,available=true,user=true,insertError=null}={}){
 const calls=[];let writes=0;
 const client={auth:{getUser:async()=>({data:{user:user?{id:'authenticated-patient'}:null}})},from(table){
   return {select(){return this;},eq(key,value){calls.push([table,key,value]);return this;},is(key,value){calls.push([table,key,value]);return this;},in(){return this;},maybeSingle:async()=>({data:table==='doctors'&&!available?null:{id:table==='doctors'?doctorId:serviceId}}),limit:async()=>({data:duplicate?[{id:'existing-request'}]:[]}),insert(){writes++;return this;},single:async()=>({data:insertError?null:{id:'new-request'},error:insertError})};
 }};
 const route=load('../app/api/appointments/route.ts',{
   '@/lib/supabase/server':{createSupabaseServerClient:async()=>client},
   'next/server':{NextResponse:{json:(body,{status=200}={})=>({body,status})}},
 });
 return {calls,get writes(){return writes;},post:()=>route.POST({json:async()=>({doctorId,serviceId,appointmentDate:'2099-01-01',appointmentTime:'09:00',notes:''})})};
}

test('identical active booking returns 409 without inserting and checks the authenticated patient ID',async()=>{
 const f=api({duplicate:true});assert.equal((await f.post()).status,409);assert.equal(f.writes,0);
 assert(f.calls.some(([table,key,value])=>table==='appointments'&&key==='patient_id'&&value==='authenticated-patient'));
 assert(f.calls.some(([table,key,value])=>table==='appointments'&&key==='doctor_id'&&value===doctorId));
});

test('new requests preserve the existing workflow; unavailable doctors and signed-out users cannot insert',async()=>{
 const valid=api();assert.equal((await valid.post()).status,201);assert.equal(valid.writes,1);
 const unavailable=api({available:false});assert.equal((await unavailable.post()).status,400);assert.equal(unavailable.writes,0);
 const signedOut=api({user:false});assert.equal((await signedOut.post()).status,401);assert.equal(signedOut.writes,0);
 const uniqueConflict=api({insertError:{code:'23505'}});assert.equal((await uniqueConflict.post()).status,409);
});
