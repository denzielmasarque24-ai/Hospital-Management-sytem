export function isValidUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// The directory RPC exposes patient_id; account-directory adapters expose id.
// Normalize once, without carrying admission fields from an earlier selection.
export function normalizeBillingPatient(row) {
  if (!row || typeof row !== 'object') throw new Error('Invalid patient directory row. Reload the patient directory.');
  const id = row.patient_id ?? row.id;
  if (!isValidUuid(id) || (row.patient_id != null && row.id != null && row.patient_id !== row.id)) {
    throw new Error('The patient directory returned an invalid or conflicting patient UUID. Reload the directory and check its response schema.');
  }
  return { patient_id: id, full_name: row.full_name ?? null, email: row.email ?? null, phone: row.phone ?? null };
}

export function createPatientRequestScope() {
  let version = 0;
  let patientId = null;
  return {
    begin(id) { patientId = id; version += 1; return version; },
    isCurrent(id, request) { return patientId === id && version === request; },
    matches(id) { return patientId === id; },
    snapshot() { const request = version; return () => request === version; },
    clear() { patientId = null; version += 1; },
  };
}
