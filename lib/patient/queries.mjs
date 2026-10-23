// Use the request's authenticated client so every read remains subject to RLS.
import { getDoctorPhotoFallback } from "../doctors/public-doctor-images.mjs";
async function rows(client, table, filter, queryContext = {}, columns = '*') {
  const result=[];
  for (let offset=0; ; offset+=500) {
    const orderBy=queryContext.orderBy || 'id';
    const ascending=queryContext.ascending ?? true;
    const {data,error}=await filter(client.from(table).select(columns)).order(orderBy,{ascending}).range(offset,offset+499);
    if (error) {
      const diagnostic = {
        table,
        operation: 'select',
        columns,
        order: { column: orderBy, ascending },
        range: { from: offset, to: offset + 499 },
        ...queryContext,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        status: error.status,
      };
      console.error('[PatientDashboard] Supabase query failed', JSON.stringify(diagnostic));
      const failure=new Error(`Could not load ${table}.`);
      failure.code=error.code || 'QUERY_FAILED';
      failure.table=table;
      throw failure;
    }
    result.push(...(data ?? []).map(row => table === 'doctors' && !row.image_url
      ? {...row,image_url:getDoctorPhotoFallback(row.display_name)}
      : row));
    if (!data || data.length<500) return result;
  }
}

export function patientRows(client, table, patientId, columns = '*', queryOptions = {}) {
  if (!patientId) throw new Error('An authenticated patient is required.');
  return rows(client,table,query=>query.eq('patient_id',patientId),{filter:'patient_id = authenticated user id',...queryOptions},columns);
}

export async function relatedRows(client, table, ids) {
  const validUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const candidates=ids.filter(id=>typeof id==='string' && id.trim() && !['null','undefined'].includes(id.trim().toLowerCase()));
  const unique=[...new Set(candidates.filter(id=>validUuid.test(id)))];
  if (unique.length !== new Set(candidates).size) {
    console.warn('[PatientDashboard] Invalid related record IDs skipped', JSON.stringify({table,invalidIdCount:new Set(candidates).size-unique.length}));
  }
  const result=[];
  for (let i=0;i<unique.length;i+=100) result.push(...await rows(client,table,query=>query.in('id',unique.slice(i,i+100)),{filter:'id IN related record IDs',relatedIdCount:unique.length}));
  return result;
}

export async function loadPatientSection(client, patientId, section) {
  if (!patientId) throw new Error('An authenticated patient is required.');
  if (section==='assigned-doctor') {
    const assignments=await patientRows(client,'patient_doctor_assignments',patientId);
    const active=assignments.filter(row=>row.ended_at==null && row.active!==false);
    const doctors=await relatedRows(client,'doctors',active.map(row=>row.doctor_id));
    return {assignments:active,doctors};
  }
  if (section==='medical-history') {
    const [records,bookings]=await Promise.all([patientRows(client,'patient_medical_records',patientId),patientRows(client,'lab_test_bookings',patientId)]);
    const [tests,doctors]=await Promise.all([
      relatedRows(client,'lab_tests',bookings.map(row=>row.lab_test_id ?? row.test_id)),
      relatedRows(client,'doctors',[...records,...bookings].map(row=>row.doctor_id)),
    ]);
    return {records,bookings,tests,doctors};
  }
  if (section==='admissions' || section==='room-information') {
    const admissions=await patientRows(client,'patient_admissions',patientId);
    if(section==='admissions') return {admissions,doctors:await relatedRows(client,'doctors',admissions.map(row=>row.doctor_id))};
    return {admissions,rooms:await relatedRows(client,'hospital_rooms',admissions.map(row=>row.room_id ?? row.hospital_room_id))};
  }
  if(section==='billing') {
    // This is the real billing view. Keep fictional bills and simulation rows
    // out of its queries entirely; they remain stored for other workflows.
    const bills=await rows(client,'patient_bills',query=>query
      .eq('patient_id',patientId)
      .eq('is_demo',false),
    {filter:'patient_id = authenticated user id AND is_demo = false'});
    const realBills=bills.filter(bill=>!/^DEMO[-_]/i.test(String(bill.bill_number??'')));
    const billIds=realBills.map(bill=>bill.id).filter(Boolean);
    if(!billIds.length) return {bills:[],charges:[],payments:[],refunds:[]};
    const [charges,payments]=await Promise.all([
      rows(client,'patient_medical_charges',query=>query.eq('patient_id',patientId).eq('is_demo',false).in('bill_id',billIds),{filter:'authenticated patient real bill IDs AND is_demo = false'}),
      rows(client,'patient_payments',query=>query.eq('patient_id',patientId).eq('is_demo',false).in('bill_id',billIds),{filter:'authenticated patient real bill IDs AND is_demo = false'}),
    ]);
    // Verified online payments are mirrored in patient_payments. Only inspect
    // their linked refund adjustments so the displayed paid balance remains
    // accurate; the patient billing view does not load or render checkout
    // attempts, methods, or provider redirects.
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const paymentIds=[...new Set(payments.map(payment=>payment.external_reference).filter(id=>typeof id==='string' && uuid.test(id)))];
    let refunds=[];
    if(paymentIds.length) {
      const {data,error}=await client.from('online_payment_refunds').select('online_payment_id,amount,status').in('online_payment_id',paymentIds);
      if(error) {
        console.error('[PatientDashboard] Billing refund adjustment query failed',JSON.stringify({table:'online_payment_refunds',operation:'select',columns:'online_payment_id,amount,status',filter:'online_payment_id IN linked authenticated patient payment references',paymentCount:paymentIds.length,code:error.code,message:error.message,details:error.details,hint:error.hint,status:error.status}));
        const failure=new Error('Could not load billing refund adjustments.');failure.code=error.code||'QUERY_FAILED';failure.table='online_payment_refunds';throw failure;
      }
      refunds=Array.isArray(data)?data:[];
    }
    return {bills:realBills,charges,payments,refunds};
  }
  if(section==='medical-supplies') {
    const [charges,bills]=await Promise.all([
      rows(client,'patient_medical_charges',query=>query.eq('patient_id',patientId).eq('category','medical_supply'),{filter:'patient_id = authenticated user id AND category = medical_supply'}),
      patientRows(client,'patient_bills',patientId),
    ]);
    return {charges,bills};
  }
  throw new Error('Unknown patient dashboard section.');
}
