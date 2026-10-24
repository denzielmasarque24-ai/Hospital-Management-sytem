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
      const failure=new Error(`Could not load ${table}: ${error.message || 'database query failed'}`);
      failure.code=error.code || 'QUERY_FAILED';
      failure.table=table;
      throw failure;
    }
    result.push(...(data ?? []).map(row => table === 'doctors' && !row.image_url
      ? {...row,image_url:row.avatar_url||getDoctorPhotoFallback(row.display_name)}
      : row));
    if (!data || data.length<500) return result;
  }
}

export function patientRows(client, table, patientId, columns = '*', queryOptions = {}) {
  if (!patientId) throw new Error('An authenticated patient is required.');
  return rows(client,table,query=>query.eq('patient_id',patientId),{filter:'patient_id = authenticated user id',...queryOptions},columns);
}

export async function relatedRows(client, table, ids, columns = '*') {
  const validUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const candidates=(Array.isArray(ids)?ids:[]).filter(id=>typeof id==='string' && id.trim() && !['null','undefined'].includes(id.trim().toLowerCase()));
  const unique=[...new Set(candidates.filter(id=>validUuid.test(id)))];
  if (unique.length !== new Set(candidates).size) {
    console.warn('[PatientDashboard] Invalid related record IDs skipped', JSON.stringify({table,invalidIdCount:new Set(candidates).size-unique.length}));
  }
  const result=[];
  for (let i=0;i<unique.length;i+=100) result.push(...await rows(client,table,query=>query.in('id',unique.slice(i,i+100)),{filter:'id IN verified related record IDs',relatedIdCount:unique.length},columns));
  return result;
}

export async function loadPatientAdmissions(client, patientId) {
  const admissions=await patientRows(client,'patient_admissions',patientId,
    'id,patient_id,doctor_id,room_id,admitted_at,discharged_at,status,reason,notes,is_demo,demo_key,created_at',
    {orderBy:'admitted_at',ascending:false});
  const relation=async(table,ids,columns)=>{
    try{return {rows:await relatedRows(client,table,ids,columns),error:null};}
    catch(error){const failure={module:table,table:error?.table||table,code:error?.code||'QUERY_FAILED',message:error?.message||`Could not load ${table}.`};console.error('[PatientDashboard] Optional admission relation failed',JSON.stringify(failure));return {rows:[],error:failure};}
  };
  const [doctors,rooms]=await Promise.all([
    relation('doctors',admissions.map(row=>row.doctor_id),'id,display_name,specialty,department,avatar_url,image_url,available,is_demo'),
    relation('hospital_rooms',admissions.map(row=>row.room_id),'id,room_number,room_type,bed_number,status,daily_rate,is_demo'),
  ]);
  // Keep querying the optional history table disabled until its migration has
  // been deployed. Enable with NEXT_PUBLIC_ROOM_ASSIGNMENT_HISTORY_ENABLED=true
  // only after applying 20261219000000_hospital_room_assignment_admin_workflow.sql.
  const roomHistoryEnabled=process.env.NEXT_PUBLIC_ROOM_ASSIGNMENT_HISTORY_ENABLED==='true';
  const assignmentRows=[];let assignmentHistoryError=null;
  if(roomHistoryEnabled&&admissions.length) {
    try {
      const {data,error}=await client.from('hospital_room_assignment_history')
        .select('id,admission_id,patient_id,room_id,assigned_at,released_at')
        .in('admission_id',admissions.map(row=>row.id)).order('assigned_at',{ascending:true});
      if(error)throw Object.assign(new Error(error.message),{code:error.code,table:'hospital_room_assignment_history'});
      assignmentRows.push(...(data??[]));
    } catch(error) {
      assignmentHistoryError={module:'hospital_room_assignment_history',table:error?.table||'hospital_room_assignment_history',code:error?.code||'QUERY_FAILED',message:error?.message||'Could not load room transfer history.'};
      console.error('[PatientDashboard] Optional room history failed',JSON.stringify(assignmentHistoryError));
    }
  }
  const assignmentRooms=assignmentRows.length?await relation('hospital_rooms',assignmentRows.map(row=>row.room_id),'id,room_number,room_type,bed_number,status,is_demo'):{rows:[],error:null};
  const doctorById=new Map(doctors.rows.map(row=>[row.id,row])),roomById=new Map(rooms.rows.map(row=>[row.id,row]));
  const assignmentRoomById=new Map(assignmentRooms.rows.map(row=>[row.id,row]));
  const historyByAdmission=new Map();
  for(const assignment of assignmentRows){const entries=historyByAdmission.get(assignment.admission_id)||[];entries.push({...assignment,room:assignmentRoomById.get(assignment.room_id)||null});historyByAdmission.set(assignment.admission_id,entries);}
  return {admissions:admissions.map(row=>({...row,doctor:row.doctor_id?doctorById.get(row.doctor_id)||null:null,room:row.room_id?roomById.get(row.room_id)||null:null,room_assignment_history:historyByAdmission.get(row.id)||[]})),roomHistoryEnabled,moduleErrors:[doctors.error,rooms.error,assignmentRooms.error,assignmentHistoryError].filter(Boolean)};
}

export async function loadPatientSection(client, patientId, section) {
  if (!patientId) throw new Error('An authenticated patient is required.');
  const careHistory = () => loadPatientAdmissions(client,patientId);
  if (section==='assigned-doctor') {
    return careHistory();
  }
  if (section==='medical-history') {
    const optional=async(label,operation,fallback=[])=>{
      try{return {data:await operation(),error:null};}
      catch(error){const failure={module:label,table:error?.table||label,code:error?.code||'QUERY_FAILED',message:error?.message||`Could not load ${label}.`};console.error('[PatientDashboard] Optional medical history query failed',JSON.stringify(failure));return {data:fallback,error:failure};}
    };
    const [recordResult,bookingResult]=await Promise.all([
      optional('patient_medical_records',()=>patientRows(client,'patient_medical_records',patientId,'id,patient_id,doctor_id,record_type,title,description,record_date,result_status,is_demo,demo_key,created_at',{orderBy:'record_date',ascending:false})),
      optional('lab_test_bookings',()=>patientRows(client,'lab_test_bookings',patientId,'id,patient_id,lab_test_id,booking_date,booking_time,status,notes',{orderBy:'booking_date',ascending:false})),
    ]);
    const records=recordResult.data,bookings=bookingResult.data;
    const [testResult,doctorResult,documentResult]=await Promise.all([
      optional('lab_tests',()=>relatedRows(client,'lab_tests',bookings.map(row=>row.lab_test_id),'id,name')),
      optional('doctors',()=>relatedRows(client,'doctors',records.map(row=>row.doctor_id),'id,display_name,specialty,department,sub_specialization,consultation_fee,avatar_url,image_url,available,is_demo')),
      optional('patient_medical_documents',()=>patientRows(client,'patient_medical_documents',patientId,'id,medical_record_id,lab_result_id,file_name,mime_type')),
    ]);
    return {records,bookings,documents:documentResult.data,tests:testResult.data,doctors:doctorResult.data,moduleErrors:[recordResult.error,bookingResult.error,testResult.error,doctorResult.error,documentResult.error].filter(error=>error!==null)};
  }
  if (section==='admissions' || section==='room-information') {
    const result=await careHistory();
    return {...result,doctors:result.admissions.map(row=>row.doctor).filter(Boolean)};
  }
  if(section==='billing') {
    // Load only this patient's bills, then keep demo and genuine records in
    // separate ledgers. The authenticated client remains subject to RLS.
    const bills=await patientRows(client,'patient_bills',patientId,'*');
    // Drafts share the authoritative bill table but are not patient obligations.
    const realBills=bills.filter(bill=>bill.is_demo===false&&!/^DEMO[-_]/i.test(String(bill.bill_number??'')) && Boolean(bill.payment_approved_at));
    const demoBills=bills.filter(bill=>bill.is_demo===true);
    const realBillIds=realBills.map(bill=>bill.id).filter(Boolean);
    const demoBillIds=demoBills.map(bill=>bill.id).filter(Boolean);
    const [charges,payments,demoCharges,demoPayments]=await Promise.all([
      realBillIds.length?rows(client,'patient_medical_charges',query=>query.eq('patient_id',patientId).eq('is_demo',false).in('bill_id',realBillIds),{filter:'authenticated patient genuine bill IDs AND is_demo = false'}):Promise.resolve([]),
      realBillIds.length?rows(client,'patient_payments',query=>query.eq('patient_id',patientId).eq('is_demo',false).in('bill_id',realBillIds),{filter:'authenticated patient genuine bill IDs AND is_demo = false'}):Promise.resolve([]),
      demoBillIds.length?rows(client,'patient_medical_charges',query=>query.eq('patient_id',patientId).in('bill_id',demoBillIds),{filter:'authenticated patient demo bill IDs'}):Promise.resolve([]),
      demoBillIds.length?rows(client,'patient_payments',query=>query.eq('patient_id',patientId).in('bill_id',demoBillIds),{filter:'authenticated patient demo bill IDs'}):Promise.resolve([]),
    ]);
    // Verified online payments are mirrored in patient_payments. Only inspect
    // their linked refund adjustments so the displayed paid balance remains
    // accurate; the patient billing view does not load or render checkout
    // attempts, methods, or provider redirects.
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const paymentIds=[...new Set([...payments,...demoPayments].map(payment=>payment.external_reference).filter(id=>typeof id==='string' && uuid.test(id)))];
    let refunds=[];
    if(paymentIds.length) {
      const {data,error}=await client.from('online_payment_refunds').select('online_payment_id,amount,status').in('online_payment_id',paymentIds);
      if(error) {
        console.error('[PatientDashboard] Billing refund adjustment query failed',JSON.stringify({table:'online_payment_refunds',operation:'select',columns:'online_payment_id,amount,status',filter:'online_payment_id IN linked authenticated patient payment references',paymentCount:paymentIds.length,code:error.code,message:error.message,details:error.details,hint:error.hint,status:error.status}));
        const failure=new Error('Could not load billing refund adjustments.');failure.code=error.code||'QUERY_FAILED';failure.table='online_payment_refunds';throw failure;
      }
      refunds=Array.isArray(data)?data:[];
    }
    const onlinePayments=realBillIds.length?await rows(client,'online_payments',query=>query.eq('patient_id',patientId).in('bill_id',realBillIds),{filter:'patient_id = authenticated user id AND genuine bill IDs'}):[];
    return {bills:realBills,charges,payments,refunds,onlinePayments,demoBills,demoCharges,demoPayments};
  }
  if(section==='medical-supplies') {
    const charges=await rows(client,'patient_medical_charges',query=>query.eq('patient_id',patientId).eq('is_demo',false),{filter:'patient_id = authenticated user id AND is_demo = false'});
    const billIds=[...new Set(charges.map(row=>row.bill_id).filter(Boolean))];
    const bills=billIds.length?await rows(client,'patient_bills',query=>query.eq('patient_id',patientId).eq('is_demo',false).in('id',billIds),{filter:'authenticated patient genuine bills linked to charges'}):[];
    const finalBillIds=bills.filter(b=>b.payment_approved_at&&!/^DEMO[-_]/i.test(String(b.bill_number??''))).map(b=>b.id);
    const visibleCharges=charges.filter(c=>!c.bill_id||finalBillIds.includes(c.bill_id));
    return {charges:visibleCharges,bills};
  }
  if(section==='dashboard-home') {
    const optional=async(label,operation,fallback=[])=>{try{return await operation();}catch(error){console.error('[PatientDashboard] Optional dashboard query failed',JSON.stringify({module:label,table:error?.table||label,code:error?.code||'QUERY_FAILED',message:error?.message}));return fallback;}};
    const [appointments,admissionResult,bills,charges,notifications]=await Promise.all([
      optional('appointments',()=>patientRows(client,'appointments',patientId,'id,doctor_id,service_id,appointment_date,appointment_time,status,notes,created_at',{orderBy:'appointment_date',ascending:true})),
      optional('admissions',careHistory),
      optional('patient_bills',()=>patientRows(client,'patient_bills',patientId,'id,bill_number,total_amount,is_demo,payment_approved_at',{orderBy:'issued_at',ascending:false})),
      optional('patient_medical_charges',()=>patientRows(client,'patient_medical_charges',patientId,'id,bill_id,item_name,category,quantity,unit_price,is_demo,charged_at',{orderBy:'charged_at',ascending:false})),
      optional('patient_notifications',async()=>{const result=await client.from('patient_notifications').select('id,title,body,created_at,is_read,href').eq('patient_id',patientId).order('created_at',{ascending:false}).limit(5);if(result.error)throw Object.assign(new Error(result.error.message),{code:result.error.code,table:'patient_notifications'});return result.data??[];}),
    ]);
    const admissions=Array.isArray(admissionResult)?admissionResult:(admissionResult?.admissions||[]);
    const realBills=bills.filter(b=>b.is_demo===false&&b.payment_approved_at&&!/^DEMO[-_]/i.test(String(b.bill_number??'')));
    const billIds=realBills.map(b=>b.id);
    const realCharges=charges.filter(c=>c.is_demo===false&&billIds.includes(c.bill_id));
    const [payments,onlinePayments,doctors]=await Promise.all([
      billIds.length?optional('patient_payments',()=>rows(client,'patient_payments',q=>q.eq('patient_id',patientId).eq('is_demo',false).in('bill_id',billIds),{filter:'authenticated patient bill IDs and genuine payments'})):Promise.resolve([]),
      billIds.length?optional('online_payments',()=>rows(client,'online_payments',q=>q.eq('patient_id',patientId).in('bill_id',billIds),{filter:'authenticated patient bill IDs'})):Promise.resolve([]),
      Promise.resolve(admissions.map(a=>a.doctor).filter(Boolean)),
    ]);
    return {appointments,admissions,rooms:admissions.filter(a=>a.room).map(a=>({...a.room,admission_id:a.id,status:a.status})),doctorAssignments:[],bills:realBills,charges:realCharges,payments,onlinePayments,notifications,doctors};
  }
  throw new Error('Unknown patient dashboard section.');
}
