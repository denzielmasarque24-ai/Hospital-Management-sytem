import * as registrationState from '../lib/supabase/registration-state.mjs';
﻿import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as errors from '../lib/supabase/login-errors.mjs';
import * as otpErrors from '../lib/supabase/otp-errors.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
function fixture({passwordError=null,sendError=null,roleHome='/admin'}={}){
 const state=[],refs=[],calls=[],logs=[],routes=[];let cursor=0,refCursor=0;
 const api={auth:{signInWithPassword:async input=>{calls.push('password');return{data:passwordError?{}:{user:{id:'test-user'},session:{access_token:'never-logged'}},error:passwordError}},signOut:async()=>{calls.push('signOut');return{error:null}},signInWithOtp:async()=>{calls.push('send-code');return{error:sendError}},verifyOtp:async input=>{assert.equal(input.type,'email');calls.push('verify');return{data:{user:{id:'test-user'},session:{}},error:null}}}};
 const exports={};const source=ts.transpileModule(readFileSync(new URL('../components/auth/LoginForm.js',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(source,{exports,console:{error:(...args)=>logs.push(args)},setTimeout,clearTimeout,require:name=>{
  if(name==='react')return{useState:init=>{const i=cursor++;if(!(i in state))state[i]=init;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v]},useRef:init=>{const i=refCursor++;return refs[i]??(refs[i]={current:init})},useEffect:()=>{}};
  if(name==='next/navigation')return{useRouter:()=>({replace:p=>routes.push(p),refresh:()=>{}}),useSearchParams:()=>({get:()=>null})};
  if(name==='@/lib/supabase/client')return{supabase:api};if(name==='@/lib/supabase/auth')return{getRoleHomePath:async()=>roleHome};if(name.endsWith('registration-state.mjs'))return registrationState;if(name.endsWith('login-errors.mjs'))return errors;if(name.endsWith('otp-errors.mjs'))return otpErrors;return require(name);
 }});
 const render=()=>{cursor=0;refCursor=0;return exports.LoginForm({})};const flat=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flat):[node,...flat(node.props?.children)];
 const fill=(id,value)=>flat(render()).find(n=>n.props?.id===id).props.onChange({target:{value}});
 return{render,flat,fill,calls,logs,routes,login:async()=>{fill('auth-login-email','test@example.com');fill('auth-login-password','test-password');await render().props.onSubmit({preventDefault(){}})}};
}
test('invalid or unconfirmed credentials never trigger OTP sending',async()=>{for(const code of ['invalid_credentials','email_not_confirmed']){const f=fixture({passwordError:{code,status:400}});await f.login();assert.deepEqual(f.calls,['password']);assert.equal(f.logs[0][1].code,code);}});
test('delivery failures preserve the exact safe diagnostic and offer cooldown-controlled retry',async()=>{const f=fixture({sendError:{code:'unexpected_failure',status:500,message:'Error sending magiclink email'}});await f.login();assert.deepEqual(f.calls,['password','signOut','send-code']);assert.equal(f.logs[0][1].operation,'send-code');assert.equal(f.logs[0][1].status,500);const buttons=f.flat(f.render()).filter(n=>n.type==='button');const resend=buttons.find(n=>String(n.props.children).includes('Resend available'));assert(resend.props.disabled);await resend.props.onClick();assert.equal(f.calls.filter(c=>c==='send-code').length,1);assert.equal(f.routes.length,0);});
test('successful email verification reads the role before routing admin and patient accounts',async()=>{for(const [roleHome,expected] of [['/admin','/admin'],['/','/patient/profile']]){const f=fixture({roleHome});await f.login();assert.equal(f.routes.length,0);f.fill('auth-login-otp','123456');await f.render().props.onSubmit({preventDefault(){}});assert.deepEqual(f.routes,[expected]);assert.deepEqual(f.calls,['password','signOut','send-code','verify']);assert(!JSON.stringify(f.logs).includes('123456'));}});
test('role destinations reject external and privileged return targets',()=>{assert.equal(errors.getLoginDestination('/','/admin'),'/patient/profile');assert.equal(errors.getLoginDestination('/','/\\evil.example'),'/patient/profile');assert.equal(errors.getLoginDestination('/admin','/products'),'/admin');});
