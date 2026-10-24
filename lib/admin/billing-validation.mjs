import { isValidUuid } from './billing-patient.mjs';

export const chargeLabel = category => ({medicine:'Medicine',medical_supply:'Medical supply',hospital_service:'Hospital service',consultation:'Doctor fee',room:'Room charge',other:'Additional charge',laboratory:'Laboratory charge',diagnostic:'Diagnostic charge'}[category] || 'Billing item');
export function validDecimal(value, places, positive = false, maximum = '999999999') {
  if (typeof value !== 'string' || !new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(value.trim())) return false;
  const [whole, fraction = ''] = value.trim().split('.');
  const scale = BigInt(10) ** BigInt(places);
  const integer = BigInt(whole) * scale + BigInt(fraction.padEnd(places,'0'));
  return integer >= (positive ? BigInt(1) : BigInt(0)) && integer <= BigInt(maximum) * scale;
}
export function validBillingDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
/** @param {any[]} lines @param {any[]} products @param {any[]} approvals @param {string|null} billId @returns {Record<string,Record<string,string>>} */
export function validateBillingLines(lines, products = [], approvals = [], billId = null) {
  /** @type {Record<string,Record<string,string>>} */
  const errors = {};
  const seenFees = new Set(), seenApprovals = new Set();
  for (const line of lines) {
    const fields = {};
    const prefix = `${chargeLabel(line.category)}: `;
    if (!['medicine','medical_supply','hospital_service','consultation','room','other','laboratory','diagnostic'].includes(line.category)) fields.category = prefix+'Select an authorized charge category.';
    if (!String(line.description || '').trim()) fields.description = prefix+'Description is required.';
    if (!validDecimal(line.quantity,3,true,'100000')) fields.quantity = prefix+'Quantity must be greater than zero with at most 3 decimal places (maximum 100,000).';
    if (!validDecimal(line.unitPrice,2)) fields.unitPrice = prefix+'A verified, nonnegative unit price with at most 2 decimal places is required.';
    if (!validBillingDate(line.date)) fields.date = prefix+'A valid service date is required.';
    if (['medicine','medical_supply'].includes(line.category)) {
      const product = products.find(item=>item.id===line.productId);
      if (!isValidUuid(line.productId)) fields.productId = prefix+'Please select a valid product.';
      else if (product) {
        if (!product.available || Number(product.stock) < Number(line.quantity)) fields.productId = prefix+'The selected product is unavailable or has insufficient stock.';
        if (Number(product.price) !== Number(line.unitPrice)) fields.unitPrice = prefix+'Use the approved catalog price. Refresh the product selection.';
      }
      if (validDecimal(line.quantity,3,true,'100000') && !Number.isInteger(Number(line.quantity))) fields.quantity = prefix+'Inventory products must use whole quantities.';
    } else {
      const approval = approvals.find(item=>item.id===line.authorizationId);
      if (!isValidUuid(line.authorizationId) || !approval || approval.category!==line.category || approval.used_bill_id && approval.used_bill_id!==billId) fields.authorizationId = prefix+(line.category==='room'?'An independently verified room rate and documented financial authorization are required.':'Select an unused financial authorization for this charge.');
      else {
        if (seenApprovals.has(approval.id)) fields.authorizationId = prefix+'This financial authorization is already used by another billing row.';
        seenApprovals.add(approval.id);
        if (Number(line.unitPrice)!==Number(approval.unit_price)) fields.unitPrice = prefix+'Unit price must match the approved financial authorization.';
        if (Number(line.quantity)>Number(approval.quantity)) fields.quantity = prefix+'Quantity exceeds the approved quantity.';
        if (line.category==='room' && (line.periodStart!==approval.period_start || line.periodEnd!==approval.period_end || Number(line.quantity)!==Number(approval.quantity))) fields.period = prefix+'Stay dates and quantity must match the verified room authorization.';
        if (line.category==='hospital_service' && line.serviceId!==approval.service_id) fields.serviceId = prefix+'Select the service covered by this financial authorization.';
        if (line.category==='consultation' && (line.consultationRecordId!==approval.consultation_record_id || line.doctorId!==approval.doctor_id)) fields.consultationRecordId = prefix+'The consultation and doctor must match the financial authorization.';
      }
    }
    if (line.category==='hospital_service' && !isValidUuid(line.serviceId)) fields.serviceId = prefix+'A valid service and verified care record are required.';
    if (line.category==='consultation') {
      if (!isValidUuid(line.consultationRecordId) || !isValidUuid(line.doctorId)) fields.consultationRecordId = prefix+'Verified consultation record and doctor are required.';
      if (seenFees.has(line.consultationRecordId)) fields.consultationRecordId = prefix+'This consultation already has a professional fee in this bill.';
      seenFees.add(line.consultationRecordId);
    }
    if (line.category==='other' && !String(line.reason || '').trim()) fields.reason = prefix+'Supporting reason is required.';
    if (Object.keys(fields).length) errors[line.key] = fields;
  }
  return errors;
}

export function lineFromAuthorization(approval, key, serviceDate) {
  return {key,category:approval.category,description:approval.description,quantity:String(approval.quantity),unitPrice:String(approval.unit_price),
    authorizationId:approval.id,serviceId:approval.service_id||undefined,doctorId:approval.doctor_id||undefined,
    consultationRecordId:approval.consultation_record_id||undefined,date:approval.service_date||serviceDate,
    periodStart:approval.period_start||undefined,periodEnd:approval.period_end||undefined,reason:approval.supporting_reason};
}
