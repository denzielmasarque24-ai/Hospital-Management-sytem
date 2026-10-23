-- READ ONLY: run in the SQL editor to compare the deployed schema and policies.
-- This does not create tables, change policies, or read/modify patient records.
select t.table_name,c.relrowsecurity as rls_enabled,
       has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_can_select
from information_schema.tables t
join pg_namespace n on n.nspname=t.table_schema
join pg_class c on c.relnamespace=n.oid and c.relname=t.table_name
where t.table_schema='public'
and t.table_name in ('appointments','patient_doctor_assignments','doctors',
  'patient_medical_records','lab_test_bookings','lab_tests','patient_admissions',
  'hospital_rooms','patient_bills','patient_medical_charges','patient_payments')
order by t.table_name;

select table_name,column_name,data_type
from information_schema.columns
where table_schema='public'
and table_name in ('patient_doctor_assignments','patient_medical_records',
 'lab_test_bookings','lab_tests','patient_admissions','hospital_rooms',
 'patient_bills','patient_medical_charges','patient_payments')
order by table_name,ordinal_position;

-- Review all policies together: permissive policies combine with OR.
-- Clinical SELECT policies must protect unreleased records as well as ownership.
-- INSERT/UPDATE/DELETE policies must require authorized staff permissions.
select tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='public'
and tablename in ('appointments','patient_doctor_assignments','doctors',
 'patient_medical_records','lab_test_bookings','lab_tests','patient_admissions',
 'hospital_rooms','patient_bills','patient_medical_charges','patient_payments')
order by tablename,cmd,policyname;

select conrelid::regclass as source_table,conname,pg_get_constraintdef(oid) as relationship
from pg_constraint
where contype='f' and connamespace='public'::regnamespace
and conrelid::regclass::text in ('patient_admissions','patient_medical_records',
 'lab_test_bookings','patient_doctor_assignments','patient_medical_charges','patient_payments')
order by source_table,conname;
