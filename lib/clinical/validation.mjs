import { isValidUuid } from '../admin/billing-patient.mjs';
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export function clinicalKind(value) {
  if (value !== 'medical' && value !== 'lab') throw new Error('Select a valid record module.');
  return value;
}
export function clinicalUuid(value) {
  if (!isValidUuid(value)) throw new Error('A valid record and patient UUID are required.');
  return value;
}
export function validateClinicalValues(kind, values) {
  clinicalKind(kind);
  if (!values || typeof values.title !== 'string' || !values.title.trim() || values.title.length > 200) throw new Error('Enter a title of up to 200 characters.');
  if (typeof values.description !== 'string' || values.description.length > 20000) throw new Error('The description must be at most 20,000 characters.');
  if (typeof values.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(values.date) || !Number.isFinite(Date.parse(values.date)) || new Date(values.date).toISOString().slice(0,10) !== values.date) throw new Error('Enter a valid record date.');
  for (const key of ['doctor_id','test_id','booking_id']) if (values[key]) clinicalUuid(values[key]);
  if (kind === 'medical' && !['consultation','check_up','diagnostic'].includes(values.record_type)) throw new Error('Select a supported medical record type.');
  if (kind === 'lab' && !values.test_id) throw new Error('Select a laboratory test.');
  return { title: values.title.trim(), description: values.description, date: values.date, doctor_id: values.doctor_id || null,
    record_type: values.record_type, test_id: values.test_id || null, booking_id: values.booking_id || null };
}
export function validateMedicalFile(bytes, mime, fileName) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Documents must be between 1 byte and 10 MB.');
  const pdf = bytes.length >= 8 && String.fromCharCode(...bytes.slice(0,5)) === '%PDF-' && String.fromCharCode(...bytes.slice(-1024)).includes('%%EOF');
  const png = [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value);
  const jpeg = bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const extension = mime === 'application/pdf' && pdf ? 'pdf' : mime === 'image/png' && png ? 'png' : mime === 'image/jpeg' && jpeg ? 'jpg' : null;
  if (!extension || typeof fileName !== 'string' || !(extension === 'jpg' ? /\.jpe?g$/i : new RegExp(`\\.${extension}$`,'i')).test(fileName)) throw new Error('Upload a valid PDF, JPG, JPEG, or PNG with a matching file type.');
  return extension;
}
