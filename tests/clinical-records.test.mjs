import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DOCUMENT_BYTES, validateMedicalFile, validateClinicalValues } from '../lib/clinical/validation.mjs';
import { buildMedicalHistory } from '../lib/patient/dashboard.mjs';

test('medical document validation rejects spoofed types, extensions and oversized files', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7\nfixture\n%%EOF');
  assert.equal(validateMedicalFile(pdf,'application/pdf','report.pdf'),'pdf');
  assert.throws(()=>validateMedicalFile(pdf,'image/png','report.png'));
  assert.throws(()=>validateMedicalFile(pdf,'application/pdf','report.html'));
  assert.throws(()=>validateMedicalFile(new TextEncoder().encode('<script>bad()</script>'),'application/pdf','report.pdf'));
  assert.throws(()=>validateMedicalFile(new Uint8Array(MAX_DOCUMENT_BYTES+1),'application/pdf','large.pdf'));
  assert.throws(()=>validateMedicalFile(new Uint8Array(),'image/jpeg','empty.jpg'));
  assert.equal(validateMedicalFile(Uint8Array.from([255,216,255,224,0,255,217]),'image/jpeg','image.jpeg'),'jpg');
  assert.equal(validateMedicalFile(Uint8Array.from([137,80,78,71,13,10,26,10,0]),'image/png','image.png'),'png');
});
test('clinical form validation validates dates, patient-linked IDs and content limits', () => {
  const values={title:'Consultation',description:'Reviewed findings',date:'2026-10-24',record_type:'consultation'};
  assert.equal(validateClinicalValues('medical',values).title,'Consultation');
  for(const overrides of [{title:''},{date:'2026-02-30'},{doctor_id:'undefined'},{description:'a'.repeat(20001)},{record_type:'unknown'}]) assert.throws(()=>validateClinicalValues('medical',{...values,...overrides}));
  assert.throws(()=>validateClinicalValues('lab',values));
});
test('patient history displays only records returned by release-filtered RLS and attaches matching documents', () => {
  const records=[
    {id:'released',title:'Released record',result_status:'released'},
    {id:'demo',is_demo:true,result_status:'recorded'},
  ];
  const history=buildMedicalHistory(records,[],[],[],[{id:'document',medical_record_id:'released',file_name:'report.pdf',mime_type:'application/pdf'},{id:'other',medical_record_id:'other',file_name:'private.pdf'}]);
  assert.deepEqual(new Set(history.map(row=>row.id)),new Set(['record-released','record-demo']));
  assert.equal(history.find(row=>row.id==='record-released').documents.length,1);
  assert.equal(history.find(row=>row.id==='record-released').resultAvailable,true);
  assert.equal(history.find(row=>row.id==='record-demo').demo,true);
});
