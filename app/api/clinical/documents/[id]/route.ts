import { clinicalUuid } from '@/lib/clinical/validation.mjs';
import { clinicalClient, ClinicalError, clinicalFailure, databaseError } from '@/lib/clinical/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = clinicalUuid((await params).id);
    const client = await clinicalClient();
    const { data, error } = await client.from('patient_medical_documents')
      .select('storage_path,file_name,mime_type').eq('id',id).maybeSingle();
    if (error) databaseError(error);
    if (!data?.storage_path) throw new ClinicalError('Document unavailable.',404);
    const download = new URL(request.url).searchParams.get('download') === '1';
    const { data: link, error: signingError } = await client.storage.from('patient-medical-documents').createSignedUrl(data.storage_path,60,download ? { download: data.file_name } : undefined);
    if (signingError || !link?.signedUrl) throw new ClinicalError('The released document could not be opened.',404);
    return new Response(null,{ status: 303, headers: { Location: link.signedUrl, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return clinicalFailure(error); }
}
