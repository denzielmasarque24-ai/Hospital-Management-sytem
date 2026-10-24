import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import * as dashboard from '../lib/patient/dashboard.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const flatten=node=>!node || typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(flatten):[node,...flatten(node.props?.children)];
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(' '):typeof node==='object'?text(node.props?.children):String(node);
function component(name) {
  const state=[];let cursor=0;
  const exports={};
  const source=ts.transpileModule(readFileSync(new URL(`../components/patient/${name}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{exports,Intl,Date,require:name=>{
    if(name==='react')return {useState(initial){const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],value=>state[index]=value];},useRef:initial=>({current:initial}),useEffect(){},useCallback:fn=>fn};
    if(name.endsWith('.css'))return {};
    if(name==='@/components/ui/Modal')return {Modal:function MockModal(){}};
    if(name==='next/link')return {default:'a',__esModule:true};
    if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
    if(name.includes('dashboard.mjs'))return dashboard;
    if(name.includes('supabase/client'))return {supabase:null};
    if(name==='./PatientMedicalHistory')return {default:'MedicalHistory',__esModule:true};
    if(name==='./AssignedDoctorPhoto')return {AssignedDoctorPhoto:()=>null};
    if(name==='./PatientBillingContent')return {default:'PatientBillingContent',__esModule:true};
    if(name==='lucide-react')return {FileText:'FileText',ShieldCheck:'ShieldCheck',ArrowUpRight:'ArrowUpRight'};
    return require(name);
  }});
  return props=>{cursor=0;return exports.default(props);};
}

test('demo bill and completed payment render separately from real totals and remain non-payable',()=>{
  const render=component('PatientBillingContent');
  const demoCharges=[1500,900,1000,200,330].map((amount,index)=>({id:`c${index}`,bill_id:'b',description:`Fixture charge ${index}`,category:'medical_supply',quantity:1,unit_price:amount,is_demo:true}));
  const tree=render({data:{bills:[],charges:[],payments:[],demoBills:[{id:'b',bill_number:'DEMO-RENALYN-202610',status:'partial',is_demo:true}],demoCharges,demoPayments:[{id:'p',bill_id:'b',amount:2000,status:'completed',payment_method:'Demo card',paid_at:'2026-10-20T00:00:00Z',is_demo:true}]}});
  const output=text(tree);
  assert.match(output,/No hospital bills have been issued to your account/);
  assert.match(readFileSync(new URL('../components/patient/PatientBillingContent.tsx',import.meta.url),'utf8'),/const billsForDisplay = \(data\.bills \?\? \[\]\)\.filter\(\(bill\) => bill\.is_demo === false && !isDemo\(bill\)\)/);
  assert.match(output,/Demo Billing History/);
  assert.match(output,/DEMO-RENALYN-202610/);
  assert.match(output,/DEMO — NOT PAYABLE/);
  assert.match(output,/Demo charges ₱3,930\.00/);
  assert.match(output,/Demo payment ₱2,000\.00/);
  assert.match(output,/Demo remaining balance ₱1,930\.00/);
  assert.match(output,/Demo card/);
  assert.match(readFileSync(new URL('../components/patient/PatientBillingContent.tsx',import.meta.url),'utf8'),/ChargeTable charges=\{bill\.chargeRows\}/);
  assert(!/MAKE A PAYMENT|Secure checkout|Payment Amount|GCash|Maya|Credit\/Debit Card|Pay Now|checkout/i.test(text(tree)));
  assert.equal(flatten(tree).filter(node=>node.props?.className==='patient-demo-badge').length,1);
});

test('discharged demo room renders only under room history',()=>{
  const render=component('PatientSectionContent');
  const tree=render({section:'room-information',data:{admissions:[{id:'a',status:'discharged',admitted_at:'2026-01-01',discharged_at:'2026-01-02',is_demo:true,room_id:'r',room:{id:'r',room_number:'DEMO-R201',bed_number:'Bed 1',room_type:'Private Room',status:'available',is_demo:true}}]}});
  const sections=flatten(tree).filter(node=>node.type==='section');
  assert(!text(sections[0]).includes('DEMO-R201'));
  assert.match(text(sections[1]),/Previous Room & Bed History.*DEMO-R201.*Discharged/s);
  assert.match(readFileSync(new URL('../components/patient/PatientSectionContent.tsx',import.meta.url),'utf8'),/Room inventory status" value=\{room\?\.status\}/);
});

test('discharged demo attending doctor appears as history with admission dates',()=>{
  const render=component('PatientSectionContent');
  const tree=render({section:'assigned-doctor',data:{admissions:[{id:'a',status:'discharged',admitted_at:'2026-01-01',discharged_at:'2026-01-02',doctor_id:'d',is_demo:true,doctor:{id:'d',display_name:'Dr. Patricia Ramos',specialty:'Family Medicine',department:'Family Medicine',is_demo:true}}]}});
  const output=text(tree);
  assert.match(output,/Previous Attending Doctors.*Dr. Patricia Ramos/s);
  assert.match(output,/Family Medicine/);
});

test('bill total remains visible and missing itemized charges are clearly identified',()=>{
  const render=component('PatientBillingContent');
  const tree=render({data:{bills:[{id:'missing',bill_number:'UNITEMIZED',is_demo:false,total_amount:3000}],billItems:[],charges:[],payments:[]}});
  assert.match(text(tree),/3,000[.]00/);
  assert.match(text(tree),/No itemized charges are available/);
  assert(!/MAKE A PAYMENT|Secure checkout|Pay Now/i.test(text(tree)));
});

test('genuine bill, itemized charges, and verified payment history render in the read-only billing view',()=>{
  const render=component('PatientBillingContent');
  const tree=render({data:{
    bills:[{id:'bill',bill_number:'B-1',is_demo:false,total_amount:100,status:'partial'}],
    charges:[{id:'charge',bill_id:'bill',is_demo:false,item_name:'Consultation',quantity:1,unit_price:100}],
    payments:[{id:'paid',bill_id:'bill',amount:30,status:'completed',is_demo:false,reference_number:'R-100',payment_method:'Cash',paid_at:'2026-01-01'}, {id:'pending',bill_id:'bill',amount:50,status:'pending',is_demo:false}],
  }});
  const chargeTable=flatten(tree).find(node=>node.type?.name==='ChargeTable');
  assert(chargeTable);
  assert.match(text(chargeTable.type(chargeTable.props)),/Consultation/);
  assert.match(text(tree),/Current bill details.*B-1.*Unpaid|Current bill details.*B-1.*Partial/s);
  assert.match(text(tree),/Outstanding balance.*70[.]00/);
  assert.match(text(tree),/R-100.*Cash.*30[.]00.*Paid/s);
  assert(!text(tree).includes('pending'));
  assert(!/MAKE A PAYMENT|Secure checkout|GCash|Maya|Credit\/Debit Card|Pay Now|checkout/i.test(text(tree)));
});

test('patient billing history ignores online attempts not mirrored as recorded payments',()=>{
  const tree=component('PatientBillingContent')({data:{
    bills:[{id:'unpaid',bill_number:'B-UNPAID',is_demo:false,total_amount:1250,status:'unpaid'}],
    charges:[{id:'charge',bill_id:'unpaid',is_demo:false,item_name:'Laboratory test',quantity:1,unit_price:1250}],payments:[],onlinePayments:[{id:'attempt',bill_id:'unpaid',amount:1250,status:'pending',payment_method:'gcash'}],
  }});
  assert.match(text(tree),/B-UNPAID/);
  assert.match(text(tree),/No verified payments have been recorded yet/);
  assert(!/GCash|Maya|Pay Now|attempt/i.test(text(tree)));
});

test('invoice details render from medical charges without the retired bill-item relation',()=>{
  const render=component('PatientBillingContent');
  const tree=render({data:{
    bills:[{id:'bill',bill_number:'B-1',is_demo:false,description:'Hospital care',total_amount:100,status:'unpaid'}],
    charges:[{id:'charge',bill_id:'bill',is_demo:false,item_name:'Consultation',quantity:1,unit_price:100,total_amount:100}],
    payments:[],onlinePayments:[],
  }});
  const table=flatten(tree).find(node=>node.type?.name==='ChargeTable');
  assert(table);
  assert.match(text(table.type(table.props)),/Consultation/);
  assert.match(text(tree),/100[.]00/);
});

test('real billing summaries exclude demo bills and include only verified payments',()=>{
  const tree=component('PatientBillingContent')({data:{
    bills:[{id:'real',bill_number:'B-REAL',is_demo:false,total_amount:100,status:'partial'},{id:'demo',bill_number:'DEMO-BILL',total_amount:9000,is_demo:true}],
    billItems:[{id:'real-item',bill_id:'real',description:'Consultation',category:'consultation',quantity:1,unit_price:100,line_total:100}],
    charges:[{id:'real-charge',bill_id:'real',is_demo:false,quantity:1,unit_price:100}],
    payments:[{id:'paid',bill_id:'real',amount:30,status:'completed',is_demo:false},{id:'pending',bill_id:'real',amount:20,status:'pending',is_demo:false}],
  }});
  const summaryComponent=flatten(tree).find(node=>node.type?.name==='SummaryCards');
  const summaries=flatten(summaryComponent.type(summaryComponent.props)).filter(node=>node.props?.className?.includes('patient-billing-summary-card'));
  assert.equal(summaries.length,3);
  assert.match(text(summaries[0]),/Total Bill Amount.*100[.]00/);
  assert.match(text(summaries[1]),/Total Paid.*30[.]00/);
  assert.match(text(summaries[2]),/Outstanding Balance.*70[.]00/);
});

test('each medical history category filters the visible records and booking completion never renders as verified',()=>{
  const render=component('PatientMedicalHistory');
  const items=['checkup','laboratory','diagnostic'].map((kind,i)=>({id:String(i),kind,title:`Fixture ${kind}`,date:'2026-01-01',doctor:'Care team',description:'Fixture description',demo:true,resultAvailable:false,status:'completed'}));
  let tree=render({items});
  assert.equal(flatten(tree).filter(node=>node.type==='article').length,3);
  for(const [label,title] of [['Check-ups','Fixture checkup'],['Laboratory Tests','Fixture laboratory'],['Diagnostics','Fixture diagnostic']]) {
    flatten(tree).find(node=>node.type==='button'&&text(node).includes(label)).props.onClick();
    tree=render({items});
    const cards=flatten(tree).filter(node=>node.type==='article');
    assert.equal(cards.length,1);
    assert.match(text(cards[0]),new RegExp(title));
    assert.match(text(cards[0]),/DEMO DATA.*No verified result available/s);
  }
});

test('three appointments appear once and completed filtering works',()=>{
  const render=component('PatientAppointments');
  const props={patientId:'fixture',requests:[],requestsError:'',appointments:['pending','confirmed','completed'].map((status,i)=>({id:String(i),service_name:'Family Medicine',department:'Family Medicine',doctor:'Doctor',specialty:'Family Medicine',preferred_date:'2026-01-01',preferred_time:'09:00:00',reason:'Fixture note',status,created_at:'2026-01-01'}))};
  let tree=render(props);
  assert.equal(flatten(tree).filter(node=>node.type==='article').length,3);
  flatten(tree).find(node=>node.type==='button'&&text(node)==='Completed').props.onClick();
  tree=render(props);
  assert.equal(flatten(tree).filter(node=>node.type==='article').length,1);
  assert.match(text(tree),/Family Medicine/);
});

test('medical history combines search, category, and Manila date and resets all filters',()=>{
  const render=component('PatientMedicalHistory');
  const items=[
    {id:'a',kind:'laboratory',title:'CBC',date:'2026-01-02T17:00:00Z',doctor:'Dr. Ramos',description:'Routine laboratory booking',demo:true,resultAvailable:false,status:'completed'},
    {id:'b',kind:'checkup',title:'Follow-up',date:'2026-01-03',doctor:'Dr. Ramos',description:'Routine visit',demo:false,resultAvailable:false,status:'recorded'},
    {id:'c',kind:'laboratory',title:'Lipid panel',date:'2026-01-04',doctor:'Dr. Cruz',description:'Screening',demo:false,resultAvailable:false,status:'pending'},
  ];
  let tree=render({items});
  const input=(type,value)=>{flatten(tree).find(node=>node.type==='input'&&node.props.type===type).props.onChange({target:{value}});tree=render({items});};
  input('search','RAMOS');
  assert.equal(flatten(tree).filter(node=>node.type==='article').length,2);
  flatten(tree).find(node=>node.type==='button'&&text(node).includes('Laboratory Tests')).props.onClick();
  tree=render({items});
  input('date','2026-01-03');
  let cards=flatten(tree).filter(node=>node.type==='article');
  assert.equal(cards.length,1);assert.match(text(cards[0]),/CBC/);
  input('date','2026-01-02');
  assert.equal(flatten(tree).filter(node=>node.type==='article').length,0);
  assert.match(text(tree),/No matching records/);
  flatten(tree).find(node=>node.type==='button'&&text(node).includes('Clear filters')).props.onClick();
  tree=render({items});
  assert.equal(flatten(tree).filter(node=>node.type==='article').length,3);
  assert.equal(flatten(tree).find(node=>node.props?.type==='search').props.value,'');
  input('search','Screening');
  assert.equal(flatten(tree).filter(node=>node.type==='article').length,1);
  input('search','2026-01-03');
  assert.equal(flatten(tree).filter(node=>node.type==='article').length,2);
});

test('timeline is newest first and View Details opens the existing modal with the selected record',()=>{
  const render=component('PatientMedicalHistory');
  const items=[{id:'old',kind:'checkup',title:'Older record',date:'2026-01-01',doctor:'Care team',description:'Recorded visit',demo:false,resultAvailable:false,status:'recorded'},
    {id:'new',kind:'laboratory',title:'Newer CBC booking',date:'2026-02-01',doctor:'Laboratory services',description:'Booking only',demo:true,resultAvailable:false,status:'completed',bookingStatus:'completed'}];
  let tree=render({items});const cards=flatten(tree).filter(node=>node.type==='article');
  assert.match(text(cards[0]),/Newer CBC booking/);assert.match(text(cards[1]),/Older record/);
  for(const [index,title] of [[0,'Newer CBC booking'],[1,'Older record']]){
    const button=flatten(cards[index]).find(node=>node.type==='button'&&text(node).includes('View Details'));
    assert.equal(button.props['aria-haspopup'],'dialog');button.props.onClick();tree=render({items});
    const modal=flatten(tree).find(node=>node.type?.name==='MockModal');assert.equal(modal.props.open,true);
    assert.match(text(modal),new RegExp(title));
    if(index===0){assert.match(text(modal),/Booking status\s+Completed/);assert.match(text(modal),/No verified result available/);}
    flatten(modal).find(node=>node.props?.['aria-label']==='Close record details').props.onClick();
    tree=render({items});assert.equal(flatten(tree).find(node=>node.type?.name==='MockModal').props.open,false);
  }
  assert(!flatten(cards[1]).some(node=>node.props?.className==='patient-demo-badge'));
});

test('empty medical history has a helpful state and accurate zero category counts',()=>{
  const tree=component('PatientMedicalHistory')({items:[]});
  assert.match(text(tree),/Your health history starts here/);
  const counts=flatten(tree).filter(node=>node.props?.className==='mh-tab-count');
  assert.equal(counts.length,4);assert(counts.every(node=>node.props.children===0));
});
