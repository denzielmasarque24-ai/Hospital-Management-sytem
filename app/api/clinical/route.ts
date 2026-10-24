import { clinicalKind, clinicalUuid, validateClinicalValues } from '@/lib/clinical/validation.mjs';
import { clinicalClient, ClinicalError, clinicalFailure, clinicalResponse, databaseError, limitedBody, sameOrigin } from '@/lib/clinical/server';

export async function GET(request: Request) {
  try {
    const client = await clinicalClient();
    const query = new URL(request.url).searchParams;
    const kind = clinicalKind(query.get('kind'));
    const patient = query.get('patient') ? clinicalUuid(query.get('patient')) : null;
    const offset = Math.max(0, Math.min(100000, Number(query.get('offset')) || 0));
    const recordDate = query.get('date') || null;
    if (recordDate && !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) throw new ClinicalError('Choose a valid date.');
    const { data, error } = await client.rpc('clinical_workspace', { p_kind: kind, p_search: (query.get('search') || '').slice(0,100), p_patient: patient, p_offset: Math.floor(offset), p_type: query.get('type') || '', p_status: query.get('status') || '', p_date: recordDate });
    if (error) databaseError(error);
    return clinicalResponse(data);
  } catch (error) { return clinicalFailure(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const client = await clinicalClient();
    const body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 128 * 1024)));
    const kind = clinicalKind(body.kind), id = clinicalUuid(body.id), patient = clinicalUuid(body.patient);
    if (body.expected != null && (typeof body.expected !== 'string' || !Number.isFinite(Date.parse(body.expected)))) throw new ClinicalError('Reload this record before continuing.');
    if (body.action === 'save') {
      let values;
      try { values = validateClinicalValues(kind, body.values); }
      catch (error) { throw new ClinicalError(error instanceof Error ? error.message : 'Check the record fields.'); }
      const { data, error } = await client.rpc('clinical_save_record', { p_kind: kind, p_id: id, p_patient: patient, p_values: values, p_expected: body.expected || null });
      if (error) databaseError(error);
      return clinicalResponse(data);
    }
    if (!['review','release','return_to_draft'].includes(body.action)) throw new ClinicalError('Choose a valid clinical action.');
    const { data, error } = await client.rpc('clinical_transition_record', { p_kind: kind, p_id: id, p_patient: patient, p_action: body.action, p_expected: body.expected || null });
    if (error) databaseError(error);
    return clinicalResponse(data);
  } catch (error) { return clinicalFailure(error); }
}
