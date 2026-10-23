// Shared display rules. These functions never write clinical or financial data.
export function isDemo(row) {
  return row?.is_demo === true || row?.metadata?.is_demo === true || row?.metadata?.demo === true ||
    [row?.bill_number, row?.invoice_number, row?.admission_number, row?.room_number, row?.receipt_number, row?.external_reference].some(value => /^DEMO[-_]/i.test(String(value ?? '')));
}

export function doctorName(doctor) {
  return doctor?.display_name || doctor?.full_name || [doctor?.first_name, doctor?.last_name].filter(Boolean).join(' ') || 'Doctor details unavailable';
}

export function formatPatientDate(value, withTime = false) {
  if (!value) return 'Not recorded';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value);
  if (!Number.isFinite(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', ...(withTime ? {timeStyle:'short'} : {}) }).format(date);
}

export function patientDateKey(value) {
  if (!value) return '';
  const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts=new Intl.DateTimeFormat('en', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-');
}

export function isCurrentAdmission(admission) {
  return !admission.discharge_date && ['admitted','active','in_progress'].includes(String(admission.status).toLowerCase());
}

export function hasReleasedResult(row) {
  // A completed booking is scheduling information, never evidence of a result.
  return ['released','verified'].includes(String(row.result_status ?? row.status).toLowerCase()) &&
    Boolean(row.result_verified_at || row.verified_at || row.verified_by) &&
    Boolean(row.released_at || row.result_released_at);
}

const cents = value => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('A financial record contains an invalid amount. Please contact billing.');
  return Math.round(amount * 100);
};

export function chargeAmount(charge) {
  return cents(charge.total_amount ?? charge.line_total ?? Number(charge.quantity) * Number(charge.unit_price)) / 100;
}

export function summarizeBills(bills, charges, payments, refunds = [], demoPayments = []) {
  return bills.map(bill => {
    const allItems = charges.filter(item => item.bill_id === bill.id);
    const billPayments = payments.filter(payment => payment.bill_id === bill.id);
    const demo = isDemo(bill) || allItems.some(isDemo) || billPayments.some(isDemo);
    // A demo invoice only includes charges explicitly marked as demo. This
    // keeps any anomalous real charge from entering its fictional balance.
    const items = demo ? allItems.filter(isDemo) : allItems;
    // A payment attached to a demo bill remains in the fictional ledger even
    // if a legacy row predates the payment-level demo flag.
    const history = billPayments.filter(payment => demo || !isDemo(payment));
    const legacyPaymentReferences = new Set(billPayments.flatMap(payment =>
      [payment.reference_number, payment.receipt_number, payment.external_reference]
        .filter(value => typeof value === 'string' && value.length > 0)
    ));
    // A simulation may have been mirrored by an older demo workflow. Prefer
    // its durable simulation row and never add the same reference twice.
    const simulations = demo ? demoPayments.filter(payment =>
      payment.bill_id === bill.id && payment.status === 'simulated' && isDemo(payment) &&
      !legacyPaymentReferences.has(payment.reference_number)
    ) : [];
    const totalCents = items.reduce((sum,item) => sum + cents(chargeAmount(item)),0);
    // Missing status is deliberately not assumed to mean completed.
    const verifiedPaidCents = history
      .filter(payment => ['completed','paid','succeeded','refunded'].includes(String(payment.status ?? payment.payment_status).toLowerCase()))
      .reduce((sum,payment) => {
        const status=String(payment.status ?? payment.payment_status).toLowerCase();
        const onlineId=payment.external_reference;
        const refundCents=onlineId ? refunds.filter(refund=>refund.online_payment_id===onlineId && refund.status==='succeeded').reduce((total,refund)=>total+cents(refund.amount),0) : 0;
        const net=status==='refunded' && refundCents===0 ? 0 : Math.max(0,cents(payment.amount)-refundCents);
        return sum+net;
      },0);
    const simulatedPaidCents = simulations.reduce((sum,payment) => sum + cents(payment.amount),0);
    const paidCents = verifiedPaidCents + simulatedPaidCents;
    return { ...bill, items, payments:history, demoPayments:simulations, demo, totalsKnown:items.length>0, total:totalCents/100, paid:paidCents/100, balance:Math.max(0,totalCents-paidCents)/100 };
  });
}

export function safeReceiptUrl(value) {
  if (typeof value!=='string' || !value || /[\\\r\n]/.test(value)) return null;
  try {
    const url=new URL(value);
    return ['https:','http:'].includes(url.protocol) ? value : null;
  } catch { return null; }
}

export function buildMedicalHistory(records, bookings, tests, doctors) {
  const doctorsById = new Map(doctors.map(row => [row.id,row]));
  const testsById = new Map(tests.map(row => [row.id,row]));
  const bookingLink = row => row.lab_test_booking_id ?? row.lab_booking_id ?? row.booking_id ?? row.metadata?.lab_test_booking_id ?? row.metadata?.lab_booking_id;
  const visibleRecords = records.filter(row => !['draft','unreleased','in_progress'].includes(String(row.status).toLowerCase()));
  const kind = value => /lab/i.test(value) ? 'laboratory' : /diagnos/i.test(value) ? 'diagnostic' : 'checkup';
  const clinical = visibleRecords.map(row => ({
    id:`record-${row.id}`, kind:kind(row.category ?? row.record_type ?? ''),
    title:row.title || row.record_title || String(row.record_type || row.category || 'Medical record').replaceAll('_',' '),
    date:row.record_date ?? row.occurred_at ?? row.created_at,
    doctor:doctorName(doctorsById.get(row.doctor_id)),
    description:row.description || row.reason || row.care_notes || 'No description recorded.',
    demo:isDemo(row), resultAvailable:hasReleasedResult(row), status:row.status || 'Recorded',
    bookingId:bookingLink(row),
    bookingStatus:null,
    attachmentPath:hasReleasedResult(row) && !isDemo(row) ? row.attachment_path || null : null,
  }));
  const bookingName = row => {
    const test=testsById.get(row.lab_test_id ?? row.test_id);
    return test?.name || test?.test_name || row.test_name || 'Laboratory booking';
  };
  const bookingDate = row => row.booking_date ?? row.appointment_date ?? row.scheduled_date ?? row.created_at;
  const normalizeTest = value => /\bcbc\b|complete blood count/i.test(String(value)) ? 'cbc' : String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const representedBookings=new Set();
  for (const item of clinical) {
    let booking=bookings.find(row=>!representedBookings.has(row.id) && (row.id===item.bookingId || row.medical_record_id===item.id.slice(7)));
    // Only merge an unlinked test/date match when both sides are unambiguous.
    // Explicit links remain authoritative; distinct same-day tests stay separate.
    if (!booking && item.kind==='laboratory' && !item.bookingId) {
      const key=normalizeTest(item.title),day=patientDateKey(item.date);
      const matchingRecords=clinical.filter(row=>row.kind==='laboratory' && normalizeTest(row.title)===key && patientDateKey(row.date)===day);
      const candidates=bookings.filter(row=>!representedBookings.has(row.id) && !row.medical_record_id && normalizeTest(bookingName(row))===key && patientDateKey(bookingDate(row))===day);
      if (day && key && matchingRecords.length===1 && candidates.length===1) booking=candidates[0];
    }
    if (booking) {
      representedBookings.add(booking.id);
      item.bookingId=booking.id;
      item.bookingStatus=booking.status || 'Booked';
      item.description+=` Laboratory booking: ${bookingName(booking)} (${booking.status || 'booked'}).`;
      item.demo ||= isDemo(booking);
      if (item.demo) item.attachmentPath=null;
    }
  }
  const scheduled = bookings.filter(row => !representedBookings.has(row.id)).map(row => {
    const test=testsById.get(row.lab_test_id ?? row.test_id);
    return {id:`booking-${row.id}`,kind:kind(test?.category || 'laboratory'),title:test?.name || test?.test_name || row.test_name || 'Laboratory booking',
      date:bookingDate(row),
      doctor:row.doctor_id ? doctorName(doctorsById.get(row.doctor_id)) : 'Laboratory services',
      description:row.notes || 'Laboratory booking. Booking completion does not confirm that a verified result is available.',
      demo:isDemo(row),resultAvailable:hasReleasedResult(row),status:row.status || 'Booked',bookingId:row.id,
      bookingStatus:row.status || 'Booked',
      attachmentPath:hasReleasedResult(row) && !isDemo(row) ? row.attachment_path || null : null};
  });
  return [...clinical,...scheduled].sort((a,b) => (Date.parse(b.date)||0)-(Date.parse(a.date)||0));
}
