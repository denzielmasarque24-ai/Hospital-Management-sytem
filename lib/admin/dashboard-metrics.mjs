export const HOSPITAL_ZONE = 'Asia/Manila';
export function hospitalDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: HOSPITAL_ZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}
export function shiftDate(value, days) {
  const d = new Date(value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0,10);
}
export function appointmentBuckets(rows, end, days) {
  const start = shiftDate(end, 1-days);
  const buckets = Array.from({length:days},(_,i)=>({date:shiftDate(start,i),scheduled:0,completed:0}));
  const byDate = new Map(buckets.map(b=>[b.date,b]));
  for(const row of rows) { const b=byDate.get(row.appointment_date); if(!b)continue; if(['pending','confirmed'].includes(row.status))b.scheduled++; else if(row.status==='completed')b.completed++; }
  return buckets;
}
export function orderStatuses(rows) {
  const counts=new Map();for(const row of rows)counts.set(row.status,(counts.get(row.status)||0)+1);
  return [...counts].map(([status,count])=>({status,count,percent:rows.length?count/rows.length*100:0}));
}
export function monthlyRevenue(rows, end, months) {
  const endDate=new Date(end+'T00:00:00Z');
  const buckets=Array.from({length:months},(_,i)=>{const d=new Date(Date.UTC(endDate.getUTCFullYear(),endDate.getUTCMonth()-months+1+i,1));return{month:d.toISOString().slice(0,7),total:0}});
  const byMonth=new Map(buckets.map(b=>[b.month,b]));
  for(const row of rows){if(row.status!=='completed'||!row.created_at)continue;const date=hospitalDate(new Date(row.created_at));if(date>end)continue;const amount=Number(row.total_amount);if(row.total_amount===null||!Number.isFinite(amount)||amount<0)throw new Error('A completed order has an invalid total.');const b=byMonth.get(date.slice(0,7));if(b)b.total+=amount;}
  return buckets;
}
