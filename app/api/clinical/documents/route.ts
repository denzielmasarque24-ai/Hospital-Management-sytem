import { createClient } from '@supabase/supabase-js';
import { clinicalKind, clinicalUuid, MAX_DOCUMENT_BYTES, validateMedicalFile } from '@/lib/clinical/validation.mjs';
import { clinicalClient, ClinicalError, clinicalFailure, clinicalResponse, databaseError, limitedBody, sameOrigin } from '@/lib/clinical/server';

export async function GET(request: Request) {
  try {
    const client = await clinicalClient();
    const query = new URL(request.url).searchParams;
    const kind = clinicalKind(query.get('kind')), id = clinicalUuid(query.get('record'));
    const field = kind === 'medical' ? 'medical_record_id' : 'lab_result_id';
    // RLS limits metadata to the authenticated owner and authorized release state.
    const { data: documents, error } = await client.from('patient_medical_documents')
      .select('id,medical_record_id,lab_result_id,file_name,mime_type,file_size,created_at').eq(field,id).order('created_at');
    if (error) databaseError(error);
    return clinicalResponse({ documents, history: [] });
  } catch (error) { return clinicalFailure(error); }
}
export async function POST(request: Request) {
  let cleanup: (() => Promise<unknown>) | undefined;
  try {
    sameOrigin(request);
    const client = await clinicalClient();
    const bytes = await limitedBody(request, MAX_DOCUMENT_BYTES + 65536);
    const form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    const kind = clinicalKind(form.get('kind')), id = clinicalUuid(form.get('record')), patient = clinicalUuid(form.get('patient'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new ClinicalError('Select a medical document.');
    const contents = new Uint8Array(await file.arrayBuffer());
    let extension: string;
    try { extension = validateMedicalFile(contents, file.type, file.name); }
    catch (error) { throw new ClinicalError(error instanceof Error ? error.message : 'Invalid document.'); }
    const { data: canWrite, error: accessError } = await client.rpc('clinical_record_access', { p_kind: kind, p_record: id, p_patient: patient, p_write: true });
    if (accessError) databaseError(accessError);
    const { data: canAuthor, error: permissionError } = await client.rpc('can_manage_patient_area', { p_area: kind === 'medical' ? 'clinical_author' : 'lab_author' });
    if (permissionError) databaseError(permissionError);
    if (!canWrite || !canAuthor) throw new ClinicalError('Documents can only be attached to an authorized patient draft.', 403);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new ClinicalError('Private uploads are not configured on the server. Contact your system administrator.', 503);
    // This credential is used only here, after user authorization, for a new
    // server-generated path. All record operations use the caller's RLS client.
    const storage = createClient(url,key,{ auth: { persistSession: false, autoRefreshToken: false } }).storage.from('patient-medical-documents');
    const document = crypto.randomUUID();
    const path = `${patient}/${kind}/${id}/${document}.${extension}`;
    const { error: uploadError } = await storage.upload(path,contents,{ contentType: file.type, upsert: false });
    if (uploadError) throw new ClinicalError('The private document upload failed.', 502);
    cleanup = async () => {
      const { data: attached, error: lookupError } = await client.from('patient_medical_documents').select('id').eq('id',document).maybeSingle();
      // A transport failure may follow a committed attach. Never delete a
      // linked document or guess whether an uncertain transaction committed.
      if (!lookupError && !attached) return storage.remove([path]);
    };
    const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200);
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) throw new ClinicalError('Sign in with a verified account.',401);
    const { error } = await client.from('patient_medical_documents').insert({
      id: document, patient_id: patient, medical_record_id: kind === 'medical' ? id : null,
      lab_result_id: kind === 'lab' ? id : null, storage_path: path, file_name: name,
      mime_type: file.type, file_size: contents.length, uploaded_by: user.id,
    });
    if (error) databaseError(error);
    cleanup = undefined;
    const { data: record, error: recordError } = await client.from(kind === 'medical' ? 'patient_medical_records' : 'patient_lab_results').select('*').eq('id',id).eq('patient_id',patient).single();
    if (recordError) databaseError(recordError);
    return clinicalResponse({ id: document, record });
  } catch (error) { if (cleanup) await cleanup(); return clinicalFailure(error); }
}
