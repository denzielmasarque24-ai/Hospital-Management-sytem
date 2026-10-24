import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export class ClinicalError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function clinicalClient() {
  const client = await createSupabaseServerClient();
  if (!client) throw new ClinicalError('The clinical service is unavailable.', 503);
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user?.email_confirmed_at) throw new ClinicalError('Sign in with a verified account.', 401);
  return client;
}
export function sameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ClinicalError('Request origin is not allowed.', 403);
}
export function databaseError(error: { code?: string; message?: string }) {
  if (error.code === '42501') throw new ClinicalError('You do not have permission for this clinical action.', 403);
  if (error.code === '40001') throw new ClinicalError('This record changed. Reload it before continuing.', 409);
  if (error.code === 'P0002') throw new ClinicalError('The record was not found for this patient.', 404);
  if (error.code === '22023') throw new ClinicalError(error.message || 'Check the supplied record fields.');
  if (error.code === 'PGRST202' || error.code === '42883') throw new ClinicalError('A required clinical database function is unavailable. Verify the deployed clinical RPC migration and reload the PostgREST schema cache.', 503);
  if (error.code === 'PGRST205' || error.code === '42P01') throw new ClinicalError('A required clinical database table or view is unavailable. Verify the clinical schema before retrying.', 503);
  if (error.code === '42703') throw new ClinicalError('A clinical query references a column that is not present in the database schema. Verify the query against the deployed table definition.', 503);
  throw new ClinicalError('The clinical operation failed. Reload the record and try again.', 500);
}
export function clinicalResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function clinicalFailure(error: unknown) {
  return clinicalResponse({ error: error instanceof ClinicalError || error instanceof Error && error.name === 'Error' ? (error instanceof ClinicalError ? error.message : 'Check the supplied record fields.') : 'The request failed.' }, error instanceof ClinicalError ? error.status : 400);
}
export async function limitedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new ClinicalError('The uploaded request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ClinicalError('An upload body is required.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new ClinicalError('The uploaded request is too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
