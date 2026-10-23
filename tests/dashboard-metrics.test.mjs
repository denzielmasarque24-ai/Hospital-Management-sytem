import test from 'node:test';
import assert from 'node:assert/strict';
import { hospitalDate, shiftDate, appointmentBuckets, monthlyRevenue, orderStatuses } from '../lib/admin/dashboard-metrics.mjs';
test('hospital dates follow Manila across UTC midnight and month boundaries',()=>{
 assert.equal(hospitalDate(new Date('2026-10-31T17:00:00Z')),'2026-11-01');
 assert.equal(shiftDate('2026-03-01',-1),'2026-02-28');
});
test('appointment charts use scheduled dates and exclude cancelled requests',()=>{
 const buckets=appointmentBuckets([{appointment_date:'2026-10-22',status:'confirmed'},{appointment_date:'2026-10-22',status:'pending'},{appointment_date:'2026-10-22',status:'cancelled'},{appointment_date:'2026-10-21',status:'completed'},{appointment_date:'2026-10-01',status:'confirmed'}],'2026-10-22',7);
 assert.equal(buckets.length,7);assert.equal(buckets.at(-1).scheduled,2);assert.equal(buckets.at(-2).completed,1);assert.equal(buckets.reduce((n,b)=>n+b.scheduled,0),2);
});
test('order status totals preserve actual statuses and percentages',()=>{
 assert.deepEqual(orderStatuses([]),[]);const result=orderStatuses([{status:'pending'},{status:'pending'},{status:'processing'}]);assert.equal(result[0].count,2);assert(Math.abs(result.reduce((n,s)=>n+s.percent,0)-100)<1e-9);
});
test('completed order values exclude pending and cancelled orders and respect Manila month boundaries',()=>{
 const values=monthlyRevenue([{status:'completed',created_at:'2026-09-30T17:00:00Z',total_amount:'1250.50'},{status:'pending',created_at:'2026-10-02T00:00:00Z',total_amount:999},{status:'cancelled',created_at:'2026-10-02T00:00:00Z',total_amount:999},{status:'completed',created_at:'2026-11-02T00:00:00Z',total_amount:999}],'2026-10-22',3);
 assert.equal(values.length,3);assert.equal(values.at(-1).total,1250.5);assert.equal(values.at(-2).total,0);
 assert.throws(()=>monthlyRevenue([{status:'completed',created_at:'2026-10-02T00:00:00Z',total_amount:null}],'2026-10-22',3));
});
