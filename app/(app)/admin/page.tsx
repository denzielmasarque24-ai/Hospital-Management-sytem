"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarClock, CircleAlert, Clock3, ListChecks, PackageCheck, RefreshCw, ShoppingCart, Stethoscope, Users } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/lib/supabase/client";
import { hospitalDate, shiftDate, appointmentBuckets, monthlyRevenue } from "@/lib/admin/dashboard-metrics.mjs";
import "./dashboard.css";

type Appointment = {id:string;patient:{first_name:string|null;last_name:string|null}|null;doctor:{display_name:string|null}|null;appointment_date:string;appointment_time:string;status:string;created_at:string};
type Order = {id:string;status:string;created_at:string;total_amount:number|null};
type Result<T> = {value:T|null;error:string|null};
type Data = {patients:Result<number>;doctors:Result<number>;products:Result<number>;lowStock:Result<number>;today:Result<number>;totalAppointments:Result<number>;upcomingAppointments:Result<number>;pendingAppointments:Result<number>;appointments:Result<Appointment[]>;latest:Result<Appointment[]>;orders:Result<Order[]>};
const unavailable = {value:null,error:null};
const initial:Data = {patients:unavailable,doctors:unavailable,products:unavailable,lowStock:unavailable,today:unavailable,totalAppointments:unavailable,upcomingAppointments:unavailable,pendingAppointments:unavailable,appointments:unavailable,latest:unavailable,orders:unavailable};
const peso=(n:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(n);
async function exact(query:PromiseLike<{count:number|null;error:{message:string}|null}>) {const r=await query;if(r.error)throw r.error;if(r.count===null)throw Error('The database returned no count.');return r.count;}
async function rows<T>(table:string,columns:string,order:string,filter?:{column:string;start:string;end:string}):Promise<T[]> {
  if(!supabase)throw Error('Supabase is not configured.');
  const all:T[]=[];for(let offset=0;;offset+=500){let q=supabase.from(table).select(columns).order(order).order('id').range(offset,offset+499);if(filter)q=q.gte(filter.column,filter.start).lte(filter.column,filter.end);const {data,error}=await q;if(error)throw error;all.push(...data as T[]);if(data.length<500)return all;}
}
async function capture<T>(job:()=>PromiseLike<T>):Promise<Result<T>> {try{return{value:await job(),error:null}}catch(e){return{value:null,error:e&&typeof e==='object'&&'message' in e?String(e.message):'Request failed. Please retry.'}}}
function State({error,empty}:{error?:string|null;empty?:string}) {return <p className="mw-dashboard-state" role={error?'alert':'status'}>{error?`Unable to load: ${error}`:empty||'Loading data...'}</p>}
function Panel({title,children,tools,className=''}:{title:string;children:ReactNode;tools?:ReactNode;className?:string}) {return <section className={`ad-card mw-panel ${className}`}><div className="ad-card-header"><h2 className="ad-card-title">{title}</h2>{tools}</div>{children}</section>}
function DashboardContent(){
  const [data,setData]=useState<Data>(initial);const [loading,setLoading]=useState(true);const [today,setToday]=useState('');const [name,setName]=useState('');const [appointmentDays,setAppointmentDays]=useState(7);const [revenueMonths,setRevenueMonths]=useState(6);const [threshold,setThreshold]=useState<number|null>(null);
  const load=useCallback(async()=>{
    setLoading(true);const client=supabase;const end=hospitalDate();setToday(end);
    if(!client){setData(Object.fromEntries(Object.keys(initial).map(k=>[k,{value:null,error:'Supabase is not configured.'}])) as Data);setLoading(false);return;}
    try {
      const results=await Promise.all([
        capture(()=>exact(client.from('profiles').select('id',{count:'exact',head:true}).ilike('role','patient'))),
        capture(()=>exact(client.from('doctors').select('id',{count:'exact',head:true}))),
        capture(()=>exact(client.from('products').select('id',{count:'exact',head:true}))),
        capture(async()=>{const {data,error}=await client.from('website_content').select('content').eq('content_key','settings').maybeSingle();if(error&&error.code!=='PGRST205')throw error;const configured=data?.content?.lowStockThreshold;const limit=configured===undefined?20:Number(configured);if(!Number.isSafeInteger(limit)||limit<0)throw Error('Configure a valid low-stock threshold in Settings.');setThreshold(limit);return exact(client.from('products').select('id',{count:'exact',head:true}).lt('stock',limit));}),
        capture(()=>exact(client.from('appointments').select('id',{count:'exact',head:true}).eq('appointment_date',end))),
        capture(()=>exact(client.from('appointments').select('id',{count:'exact',head:true}))),
        capture(()=>exact(client.from('appointments').select('id',{count:'exact',head:true}).gt('appointment_date',end).in('status',['pending','confirmed']))),
        capture(()=>exact(client.from('appointments').select('id',{count:'exact',head:true}).eq('status','pending'))),
        capture(()=>rows<Appointment>('appointments','id,patient:profiles!appointments_patient_id_fkey(first_name,last_name),doctor:doctors(display_name),appointment_date,appointment_time,status,created_at','appointment_date',{column:'appointment_date',start:shiftDate(end,-29),end})),
        capture(async()=>{const {data,error}=await client.from('appointments').select('id,patient:profiles!appointments_patient_id_fkey(first_name,last_name),doctor:doctors(display_name),appointment_date,appointment_time,status,created_at').order('created_at',{ascending:false}).order('id').limit(6).returns<Appointment[]>();if(error)throw error;return data as Appointment[];}),
        capture(()=>rows<Order>('orders','id,status,created_at,total_amount','created_at')),
      ]);
      setData({patients:results[0],doctors:results[1],products:results[2],lowStock:results[3],today:results[4],totalAppointments:results[5],upcomingAppointments:results[6],pendingAppointments:results[7],appointments:results[8],latest:results[9],orders:results[10]});
    }finally{setLoading(false)}
  },[]);
  useEffect(()=>{
    void load();
    void supabase?.auth.getUser().then(async({data})=>{if(!data.user)return;const {data:profile}=await supabase!.from('profiles').select('first_name').eq('id',data.user.id).maybeSingle();setName(profile?.first_name||data.user.user_metadata?.first_name||'');});
    const refresh=()=>void load();
    window.addEventListener('focus',refresh);
    window.addEventListener('medwell:appointments-updated',refresh);
    document.addEventListener('visibilitychange',refresh);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('medwell:appointments-updated',refresh);document.removeEventListener('visibilitychange',refresh)};
  },[load]);
  const metrics=[
    {label:'Registered Patients',result:data.patients,href:'/admin/patients',description:'Patient profiles',Icon:Users,tone:'blue'},
    {label:'Doctors',result:data.doctors,href:'/admin/doctors',description:'Doctor profiles',Icon:Stethoscope,tone:'teal'},
    {label:"Today's Appointments",result:data.today,href:'/admin/appointments',description:'All statuses · appointment date in Manila today',Icon:CalendarDays,tone:'blue'},
    {label:'Total Appointments',result:data.totalAppointments,href:'/admin/appointments',description:'All appointment records',Icon:ListChecks,tone:'teal'},
    {label:'Upcoming Appointments',result:data.upcomingAppointments,href:'/admin/appointments',description:'Future pending or confirmed appointments',Icon:CalendarClock,tone:'blue'},
    {label:'Pending Appointments',result:data.pendingAppointments,href:'/admin/appointments',description:'Awaiting confirmation or review',Icon:Clock3,tone:'amber'},
    {label:'Products',result:data.products,href:'/admin/products',description:'Hospital and pharmacy catalog',Icon:PackageCheck,tone:'teal'},
    {label:'Low Stock Items',result:data.lowStock,href:'/admin/inventory',description:threshold===null?'Configured stock threshold':`Stock below ${threshold} (Settings default if unconfigured)`,Icon:CircleAlert,tone:'amber'},
  ];
  const shortcuts=[['Manage Appointments','Review patient care requests','/admin/appointments',CalendarDays],['View Patients','Open the patient directory','/admin/patients',Users],['Manage Products','Update prices and verified stock','/admin/products',PackageCheck],['Review Orders','Track online pharmacy orders','/admin/orders',ShoppingCart]] as const;
  const bars=appointmentBuckets(data.appointments.value||[],today||hospitalDate(),appointmentDays);const max=Math.max(1,...bars.map(b=>Math.max(b.scheduled,b.completed)));const hasCompleted=data.appointments.value?.some(a=>a.status==='completed');
  const revenue=captureRevenue(data.orders.value,today||hospitalDate(),revenueMonths);const revenueMax=Math.max(1,...revenue.values.map(b=>b.total));
  return <div className="mw-dashboard" aria-busy={loading}>
    <section className="ad-dashboard-welcome mw-welcome"><div className="ad-welcome-copy"><span className="ad-eyebrow">Hospital operations</span><h1>Welcome back{name ? <>, <span className="mw-welcome-name">{name}</span></> : null}!</h1><p>Here is the latest overview of your hospital and pharmacy operations.</p></div><div className="ad-dashboard-actions"><span className="ad-date-chip"><CalendarDays size={15}/>{today||'Today'} · Manila</span><button className="ad-refresh-button" disabled={loading} onClick={()=>void load()}><RefreshCw size={15} className={loading?'ad-spinning':''}/>{loading?'Refreshing...':'Refresh Dashboard'}</button></div></section>
    <section className="ad-dashboard-metrics mw-metrics" aria-label="Hospital statistics">{metrics.map(({label,result,href,description,Icon,tone})=><Link key={label} href={href} className="ad-metric-card"><span className={`ad-metric-icon ${tone}`}><Icon size={21}/></span><span className="ad-metric-copy"><span className="ad-metric-label">{label}</span><strong>{loading?'…':result.value===null?'Unavailable':result.value.toLocaleString()}</strong><small>{!loading&&result.error?'Query failed — refresh to retry':description}</small></span></Link>)}</section>
    {!loading&&metrics.some(m=>m.result.error)&&<details className="mw-errors"><summary>Some statistics could not be loaded</summary>{metrics.filter(m=>m.result.error).map(m=><p key={m.label}>{m.label}: {m.result.error}</p>)}</details>}
    <div className="mw-top-grid"><Panel title="Quick Actions"><div className="mw-shortcuts">{shortcuts.map(([title,description,href,Icon])=><Link href={href} key={href}><span className="mw-shortcut-icon"><Icon size={21}/></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={16}/></Link>)}</div></Panel>
    <Panel title="Appointment Analytics" tools={<select aria-label="Appointment date range" value={appointmentDays} onChange={e=>setAppointmentDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option></select>}>
      {loading||data.appointments.error?<State error={data.appointments.error}/>:data.appointments.value?.length===0?<State empty="No appointments in the last 30 days."/>:<div className="mw-chart-body"><div className="mw-chart-legend"><span><i/>Scheduled (pending / confirmed)</span>{hasCompleted&&<span><i className="teal"/>Completed</span>}</div><svg viewBox="0 0 620 190" role="img" aria-label={`Daily appointment counts for the last ${appointmentDays} days`}><title>Appointment counts by hospital-local date</title>{[0,.5,1].map(v=><g key={v}><line x1="35" x2="610" y1={150-v*125} y2={150-v*125} stroke="#e5edf5"/><text x="28" y={154-v*125} textAnchor="end">{Math.ceil(max*v)}</text></g>)}{bars.map((b,i)=>{const x=40+i*565/bars.length;const w=565/bars.length;return <g key={b.date}><title>{`${b.date}: ${b.scheduled} scheduled, ${b.completed} completed`}</title><rect x={x} y={150-b.scheduled/max*125} width={w*(hasCompleted?.36:.65)} height={b.scheduled/max*125} rx="2" fill="#3276e8"/>{hasCompleted&&<rect x={x+w*.4} y={150-b.completed/max*125} width={w*.36} height={b.completed/max*125} rx="2" fill="#0caaa4"/>}{(i%Math.ceil(bars.length/7)===0||i===bars.length-1)&&<text x={x+w/2} y="174" textAnchor="middle">{b.date.slice(5)}</text>}</g>})}</svg><p className="mw-caption">By appointment date · Asia/Manila</p></div>}
    </Panel></div>
    <div className="mw-bottom-grid"><Panel title="Latest Appointments" className="mw-latest" tools={<Link className="ad-panel-link" href="/admin/appointments">View All <ArrowRight size={14}/></Link>}>{loading||data.latest.error?<State error={data.latest.error}/>:!data.latest.value?.length?<State empty="No appointments have been recorded."/>:<div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Patient</th><th>Assigned Doctor</th><th>Date &amp; Time</th><th>Status</th></tr></thead><tbody>{data.latest.value.map(a=><tr key={a.id}><td><strong>{[a.patient?.first_name,a.patient?.last_name].filter(Boolean).join(' ')||'Name not supplied'}</strong></td><td>{a.doctor?.display_name||'Not assigned'}</td><td>{a.appointment_date}<small className="mw-table-time">{a.appointment_time.slice(0,5)}</small></td><td><span className={`ad-badge ${a.status==='confirmed'?'ad-badge-green':a.status==='cancelled'?'ad-badge-red':a.status==='completed'?'ad-badge-blue':'ad-badge-yellow'}`}>{a.status}</span></td></tr>)}</tbody></table></div>}</Panel>
    <Panel title="Monthly Revenue" tools={<select aria-label="Revenue date range" value={revenueMonths} onChange={e=>setRevenueMonths(Number(e.target.value))}><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select>}>{loading||data.orders.error||revenue.error?<State error={data.orders.error||revenue.error}/>:!data.orders.value?.some(o=>o.status==='completed')?<State empty="No completed orders recorded."/>:<div className="mw-chart-body"><strong className="mw-revenue-total">{peso(revenue.values.reduce((n,b)=>n+b.total,0))}</strong><svg viewBox="0 0 420 185" role="img" aria-label="Monthly completed-order value"><title>Completed-order totals by creation month</title>{[0,.5,1].map(v=><g key={v}><line x1="65" x2="410" y1={145-v*100} y2={145-v*100} stroke="#e5edf5"/><text x="59" y={149-v*100} textAnchor="end">{peso(revenueMax*v)}</text></g>)}<polyline points={revenue.values.map((b,i)=>`${72+i*325/Math.max(1,revenue.values.length-1)},${145-b.total/revenueMax*100}`).join(' ')} fill="none" stroke="#0caaa4" strokeWidth="3"/>{revenue.values.map((b,i)=><g key={b.month}><title>{`${b.month}: ${peso(b.total)}`}</title><circle cx={72+i*325/Math.max(1,revenue.values.length-1)} cy={145-b.total/revenueMax*100} r="4" fill="#0caaa4"/>{(i%Math.ceil(revenue.values.length/6)===0||i===revenue.values.length-1)&&<text x={72+i*325/Math.max(1,revenue.values.length-1)} y="172" textAnchor="middle">{b.month.slice(2)}</text>}</g>)}</svg><p className="mw-caption">Completed-order totals by creation month. Payment status and payment timestamps are unavailable; these totals are not verified cash receipts.</p></div>}</Panel></div>
  </div>
}
function captureRevenue(orders:Order[]|null,end:string,months:number){try{return{values:monthlyRevenue(orders||[],end,months),error:null}}catch{return{values:[],error:'A completed order has invalid financial data. Review Orders before reporting revenue.'}}}
export default function AdminDashboard(){return <AdminShell title="Dashboard" adminOnly><DashboardContent/></AdminShell>}
