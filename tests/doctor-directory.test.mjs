import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const flat=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flat):[node,...flat(node.props?.children)];
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(' '):typeof node==='object'?text(node.props?.children):String(node);
const doctors=Array.from({length:20},(_,i)=>({id:`existing-doctor-${i}`,name:`Doctor ${String(i+1).padStart(2,'0')}`,department:i<10?'Test department':null,specialty:i%2?'Test specialty B':'Test specialty A',subSpecialization:null,canBook:i!==19,image:null,isDemo:true,href:`/doctors/existing-doctor-${i}`}));
function directory({rows=doctors,loading=false,error=null}={}){
 const state=[];let cursor=0,retries=0;const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/doctors/DoctorDirectory.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>{
   if(name==='react')return {useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useMemo:fn=>fn()};
   if(name.endsWith('.css'))return {};
   if(name==='next/link')return {default:'a',__esModule:true};
   if(name==='./usePublicDoctors')return {usePublicDoctors:()=>({doctors:rows,loading,error,retry:()=>retries++})};
   if(name==='./DoctorAvatar')return {DoctorAvatar:'avatar'};
   return require(name);
 }});
 return {render(){cursor=0;return exports.DoctorDirectory();},get retries(){return retries;}};
}
const bodyRows=tree=>flat(tree).find(node=>node.type==='tbody').props.children;

test('directory paginates all 20 doctors ten per page with original IDs and dynamic totals',()=>{
 const f=directory();let tree=f.render();
 assert.equal(bodyRows(tree).length,10);assert.match(text(tree),/Showing\s+1\s+to\s+10\s+of\s+20\s+doctors/);
 flat(tree).find(node=>node.props?.['aria-label']==='Page 2').props.onClick();tree=f.render();
 assert.equal(bodyRows(tree).length,10);assert.equal(bodyRows(tree)[0].key,'existing-doctor-10');
 assert.match(text(tree),/Showing\s+11\s+to\s+20\s+of\s+20\s+doctors/);
 assert.equal(flat(tree).find(node=>node.props?.['aria-label']==='Page 2').props['aria-current'],'page');
 assert.equal(flat(tree).find(node=>node.type==='button'&&text(node).includes('Next')).props.disabled,true);
});

test('search and database-derived filters combine and reset pagination',()=>{
 const f=directory();let tree=f.render();flat(tree).find(node=>node.props?.['aria-label']==='Page 2').props.onClick();tree=f.render();
 flat(tree).find(node=>node.props?.type==='search').props.onChange({target:{value:'Doctor 19'}});tree=f.render();
 assert.equal(bodyRows(tree).length,1);assert.equal(bodyRows(tree)[0].key,'existing-doctor-18');
 assert.match(text(tree),/Showing\s+1\s+to\s+1\s+of\s+1/);
 flat(tree).find(node=>node.type==='button'&&text(node)===' Clear Filters').props.onClick();tree=f.render();
 flat(tree).find(node=>node.props?.['aria-label']==='Filter doctors by department').props.onChange({target:{value:'__unspecified__'}});tree=f.render();
 flat(tree).find(node=>node.props?.['aria-label']==='Filter doctors by specialization').props.onChange({target:{value:'Test specialty A'}});tree=f.render();
 assert.equal(bodyRows(tree).length,5);assert.match(text(tree),/Not specified/);
 assert(!text(tree).includes('Cardiology'));
});

test('each sortable header toggles ascending and descending before pagination',()=>{
 const f=directory();let tree=f.render();
 for(let i=0;i<4;i++){
   let header=flat(tree).filter(node=>node.type==='th')[i];
   flat(header).find(node=>node.type==='button').props.onClick();tree=f.render();
   header=flat(tree).filter(node=>node.type==='th')[i];const first=header.props['aria-sort'];
   flat(header).find(node=>node.type==='button').props.onClick();tree=f.render();
   const second=flat(tree).filter(node=>node.type==='th')[i].props['aria-sort'];
   assert.notEqual(first,second);
 }
});

test('profile and booking buttons retain the selected ID and unavailable doctors cannot be booked',()=>{
 const tree=directory({rows:[doctors[0],doctors[19]]}).render();
 assert(flat(tree).some(node=>node.props?.href==='/appointment?doctor=existing-doctor-0'));
 assert(flat(tree).some(node=>node.props?.href==='/doctors/existing-doctor-0'));
 assert(!flat(tree).some(node=>node.props?.href==='/appointment?doctor=existing-doctor-19'));
 assert(flat(tree).find(node=>node.type==='button'&&text(node).includes('Unavailable')).props.disabled);
});

test('loading skeletons, query errors with retry, and empty states remain distinct',()=>{
 assert.equal(bodyRows(directory({loading:true}).render()).length,10);
 const f=directory({error:'Public API unavailable'}),tree=f.render();
 assert.match(text(tree),/temporarily unavailable/);assert(!text(tree).includes('No matching doctors'));
 flat(tree).find(node=>node.type==='button'&&text(node)==='Try Again').props.onClick();assert.equal(f.retries,1);
 assert.match(text(directory({rows:[]}).render()),/No doctor profiles available/);
});

test('avatar tries the stored image, stored avatar, then a generic icon after failures',()=>{
 const exports={},state=[];let cursor=0;
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/doctors/DoctorAvatar.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>name==='react'?{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];}}:name.endsWith('.css')?{}:require(name)});
 const render=()=>{cursor=0;return exports.DoctorAvatar({image:'stored-image',fallbackImage:'stored-avatar',name:'Fixture doctor'});};
 let image=flat(render()).find(node=>node.type==='img');assert.equal(image.props.src,'stored-image');assert.equal(image.props.width,56);assert.equal(image.props.height,56);image.props.onError();
 image=flat(render()).find(node=>node.type==='img');assert.equal(image.props.src,'stored-avatar');image.props.onError();
 assert(!flat(render()).some(node=>node.type==='img'));assert(flat(render()).some(node=>node.props?.role==='img'));
});

test('public doctor loader preserves saved classifications across all API pages without private fields',async()=>{
 const exports={},calls=[];
 const rows=Array.from({length:61},(_,i)=>({id:`actual-${i}`,display_name:`Name ${i}`,department:`Saved department ${i}`,specialty:'Existing specialty',sub_specialization:`Saved sub-specialization ${i}`,bio:'Existing biography',education:'Existing education',consultation_fee:250,available:true}));
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/services/public-service.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-test-key'}},fetch:async url=>{const u=new URL(url),offset=Number(u.searchParams.get('offset'));calls.push(u);return {ok:true,json:async()=>rows.slice(offset,offset+50)};}});
 const loaded=await exports.getPublicDoctors();assert.equal(loaded.length,61);assert.equal(loaded[60].id,'actual-60');
 for(const call of calls){const projection=call.searchParams.get('select').split(',');for(const field of ['license_number','profile_id','email','phone'])assert(!projection.includes(field));for(const field of ['department','specialty','sub_specialization','education','consultation_fee'])assert(projection.includes(field));}
 for(let i=0;i<rows.length;i++){assert.equal(loaded[i].department,rows[i].department);assert.equal(loaded[i].specialty,rows[i].specialty);assert.equal(loaded[i].sub_specialization,rows[i].sub_specialization);}
});

test('all twenty saved classifications render unchanged across both directory pages',()=>{
 const rows=doctors.map((doctor,i)=>({...doctor,department:`Saved department ${i}`,subSpecialization:`Saved sub-specialization ${i}`}));
 const f=directory({rows});let tree=f.render();
 for(const page of [1,2]){
   if(page===2){flat(tree).find(node=>node.props?.['aria-label']==='Page 2').props.onClick();tree=f.render();}
   assert.equal(bodyRows(tree).length,10);
   for(const row of bodyRows(tree)){
     const saved=rows.find(doctor=>doctor.id===row.key),cells=flat(row).filter(node=>node.type==='td');
     assert.equal(text(cells[1]),saved.department);assert.equal(text(cells[2]),saved.specialty);assert.equal(text(cells[3]),saved.subSpecialization);
     assert(!text(row).includes('Not specified'));
   }
 }
});
