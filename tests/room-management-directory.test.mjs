import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let PGlite;
try { ({ PGlite } = await import('../.tmp/clinical-db/node_modules/@electric-sql/pglite/dist/index.js')); } catch {}

const migration = readFileSync(new URL('../supabase/migrations/20261221000000_repair_admin_admission_patient_directory.sql', import.meta.url), 'utf8');
const roomManagement = readFileSync(new URL('../components/admin/RoomManagement.tsx', import.meta.url), 'utf8');

test('Room Management calls the no-argument directory RPC and the repair grants only authenticated execution', () => {
  assert.match(roomManagement, /rpc\("admin_admission_patient_directory"\)/);
  assert.match(roomManagement, /setPatients\(\(\(pp\.data\|\|\[\]\) as Array<\{patient_id:string;full_name:string\}>\)\.map/);
  assert.match(roomManagement, /patients\.filter\(patient=>!activePatientIds\.has\(patient\.id\)\)\.map/);
  assert.match(migration, /create or replace function public\.admin_admission_patient_directory\(\)\s*returns table\(patient_id uuid, full_name text\)/i);
  assert.match(migration, /can_manage_patient_area\('admissions'\)/);
  assert.match(migration, /where upper\(p\.role::text\)='PATIENT'/);
  assert.match(migration, /revoke all on function public\.admin_admission_patient_directory\(\) from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.admin_admission_patient_directory\(\) to authenticated/i);
  assert.match(migration, /notify pgrst,\s*'reload schema'/i);
});

test('admission patient directory returns registered patients only and enforces admissions authorization', { skip: !PGlite && 'Install the local PGlite engine as described in docs/clinical-records.md' }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table public.profiles(
        id uuid primary key,
        role text not null,
        first_name text,
        middle_name text,
        last_name text,
        suffix text
      );
      create function public.can_manage_patient_area(p_area text)
      returns boolean language sql stable as $$
        select p_area='admissions' and coalesce(current_setting('test.admissions',true),'false')='true'
      $$;
      insert into public.profiles values
        ('00000000-0000-4000-8000-000000000001','PATIENT','Ada',null,'Patient',null),
        ('00000000-0000-4000-8000-000000000002','DOCTOR','Doctor',null,'Staff',null);
    `);
    await db.exec(migration);

    await db.exec("select set_config('test.admissions','true',false); set role authenticated");
    const patients = await db.query('select * from public.admin_admission_patient_directory()');
    assert.deepEqual(patients.rows, [{ patient_id: '00000000-0000-4000-8000-000000000001', full_name: 'Ada Patient' }]);

    await db.exec("reset role; select set_config('test.admissions','false',false); set role authenticated");
    await assert.rejects(db.query('select * from public.admin_admission_patient_directory()'), /Admissions permission required/);
  } finally {
    await db.close();
  }
});
