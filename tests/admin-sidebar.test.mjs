import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const flat=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(flat):[n,...flat(n.props?.children)];
function fixture(path='/admin',error=null){const updates=[],location={href:''};let signedOut=0;const exports={};const source=ts.transpileModule(readFileSync(new URL('../components/admin/AdminSidebar.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInNewContext(source,{exports,window:{location},require:n=>{if(n==='react')return{useState:v=>[v,value=>updates.push(value)]};if(n==='next/link')return{default:'link'};if(n==='next/navigation')return{usePathname:()=>path};if(n==='@/lib/supabase/client')return{supabase:{auth:{signOut:async()=>{signedOut++;return{error}}}}};return require(n)}});let closed=0,collapsed=0;const tree=exports.AdminSidebar({role:'ADMIN',userName:'Test Admin',onClose:()=>closed++,onToggleCollapse:()=>collapsed++});return{tree,nodes:flat(tree),location,updates,count:()=>signedOut,closed:()=>closed,collapsed:()=>collapsed}}
test('sidebar preserves existing navigation and adds working clinical modules',()=>{
  const f=fixture();
  const groups=f.nodes.filter(n=>n.props?.className==='ad-nav-section').map(n=>n.props.children);
  assert.deepEqual(groups,['Main','People','Hospital Operations','Finance','Content Management','System']);
  const links=f.nodes.filter(n=>n.type==='link'&&n.props.className.includes('ad-nav-link'));
  const required=['/admin','/admin/patients','/admin/doctors','/admin/staff','/admin/appointments','/admin/room-rates','/admin/rooms','/admin/services','/admin/inventory','/admin/payments','/admin/careers','/admin/messages','/admin/settings','/admin/medical-records','/admin/laboratory-results'];
  assert.deepEqual(new Set(links.map(link=>link.props.href)),new Set(required));
  for(const link of links){const path='app/(app)'+link.props.href+'/page';assert(['.tsx','.js'].some(ext=>existsSync(path+ext)),link.props.href);link.props.onClick();}
  assert.equal(f.closed(),links.length);
  f.nodes.find(n=>n.props?.className==='ad-sidebar-collapse-btn').props.onClick();assert.equal(f.collapsed(),1);
});
test('active route matches nested paths without prefix collisions',()=>{for(const [path,expected] of [['/admin','Dashboard Overview'],['/admin/patients/example','Patients'],['/admin/patients-other',null]]){const active=fixture(path).nodes.filter(n=>n.props?.['aria-current']==='page');assert.equal(active.length,expected?1:0);if(expected)assert.equal(active[0].props['aria-label'],expected)}});
test('logout redirects only after successful Supabase sign-out',async()=>{for(const error of [null,{message:'network failure'}]){const f=fixture('/admin',error);f.nodes.find(n=>n.props?.title==='Logout').props.onClick();await new Promise(r=>setImmediate(r));assert.equal(f.count(),1);assert.equal(f.location.href,error?'':'/');if(error)assert(f.updates.includes('Could not sign out. Please try again.'));}});
