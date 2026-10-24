import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react');
const flat=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flat):[node,...flat(node.props?.children)];
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(' '):typeof node==='object'?text(node.props?.children):String(node);
function render(kind,canAuthor,canRelease,state='draft') {
  let index=0;
  const row={id:'fixture-record',patient_id:'fixture-patient',patient_name:'Fixture Patient',doctor_id:'fixture-doctor',reviewing_doctor_id:'fixture-doctor',record_type:'consultation',title:'Fixture Record',result_title:'Fixture Result',description:'Fixture findings',record_date:'2026-10-24',delivery_state:state,created_at:'2026-10-24T00:00:00Z'};
  const overrides={0:{patients:[{id:'fixture-patient',full_name:'Fixture Patient'}],records:[row],doctors:[{id:'fixture-doctor',display_name:'Fixture Doctor'}],tests:[],bookings:[],canAuthor,canRelease},2:'fixture-patient',7:row,8:{title:row.title,description:row.description,date:row.record_date,doctor_id:row.doctor_id,record_type:'consultation',test_id:'',booking_id:''},9:[{id:'fixture-document',file_name:'report.pdf',file_size:1024}],10:[{id:'fixture-event',action:'created',actor_id:'fixture-author',occurred_at:'2026-10-24T00:00:00Z'}],13:false};
  const hooks={...React,useState:initial=>[index in overrides?overrides[index++]:((index++),initial),()=>{}],useRef:initial=>({current:initial}),useCallback:fn=>fn,useEffect(){}};
  const source=ts.transpileModule(readFileSync(new URL('../components/admin/ClinicalRecordManager.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};
  new Function('require','exports',source)(name=>name==='react'?hooks:name==='./AdminShell'?{AdminShell:({children})=>children}:name.endsWith('.css')?{}:require(name),exports);
  return exports.default({kind});
}
test('clinical module lists render without key warnings and expose role-appropriate actions',()=>{
  const {renderToStaticMarkup}=require('react-dom/server');
  for(const kind of ['medical','lab']){
    const warnings=[],original=console.error;let tree;
    try{console.error=(...args)=>warnings.push(args.join(' '));tree=render(kind,true,true);renderToStaticMarkup(tree);}finally{console.error=original;}
    assert.ok(!warnings.some(message=>/unique.*key|same key/i.test(message)),warnings.join('\n'));
    const output=text(tree);assert.match(output,/Fixture Patient/);assert.match(output,/Save Draft/);assert.match(output,/Mark as Reviewed/);assert.match(output,/Record History/);
    assert.ok(flat(tree).some(node=>node.props?.href==='/api/clinical/documents/fixture-document?download=1'));
    const author=text(render(kind,true,false));assert.ok(!author.includes('Mark as Reviewed'));
    const reviewed=text(render(kind,false,true,'reviewed'));assert.match(reviewed,/Release (to Patient|Lab Result)/);
    const released=text(render(kind,true,true,'released'));assert.ok(!released.includes('Mark as Reviewed'));assert.ok(!released.includes('Upload document'));assert.ok(!released.includes('Save Draft'));
  }
});
