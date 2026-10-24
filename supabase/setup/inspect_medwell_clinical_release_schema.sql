-- Read-only schema inventory needed before repairing the clinical release RPCs.
-- Run in the target Supabase SQL editor and retain each result set.

-- Actual columns, types, nullability, and defaults.
select table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'patient_medical_records',
    'patient_lab_results',
    'patient_medical_documents',
    'medwell_medical_record_releases',
    'medwell_medical_release_audit'
  )
order by table_name, ordinal_position;

-- Foreign key relationships for those tables.
select source.relname as source_table,
       source_col.attname as source_column,
       target.relname as target_table,
       target_col.attname as target_column,
       constraint_row.conname as constraint_name,
       pg_get_constraintdef(constraint_row.oid) as definition
from pg_constraint constraint_row
join pg_class source on source.oid = constraint_row.conrelid
join pg_namespace source_ns on source_ns.oid = source.relnamespace
join pg_class target on target.oid = constraint_row.confrelid
join lateral unnest(constraint_row.conkey) with ordinality source_key(attnum, position) on true
join lateral unnest(constraint_row.confkey) with ordinality target_key(attnum, position)
  on target_key.position = source_key.position
join pg_attribute source_col on source_col.attrelid = source.oid and source_col.attnum = source_key.attnum
join pg_attribute target_col on target_col.attrelid = target.oid and target_col.attnum = target_key.attnum
where source_ns.nspname = 'public'
  and constraint_row.contype = 'f'
  and (
    source.relname in ('patient_medical_records','patient_lab_results','patient_medical_documents','medwell_medical_record_releases','medwell_medical_release_audit')
    or target.relname in ('patient_medical_records','patient_lab_results','patient_medical_documents','medwell_medical_record_releases','medwell_medical_release_audit')
  )
order by source.relname, constraint_row.conname, source_key.position;

-- RLS enablement and policies, including USING and WITH CHECK expressions.
select relation.relname as table_name,
       relation.relrowsecurity as rls_enabled,
       policy.polname as policy_name,
       case policy.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
            when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as command,
       array_to_string(array(
         select pg_get_userbyid(role_oid)
         from unnest(policy.polroles) as role_oid
       ), ', ') as roles,
       pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
       pg_get_expr(policy.polwithcheck, policy.polrelid) as with_check_expression
from pg_class relation
join pg_namespace relation_ns on relation_ns.oid = relation.relnamespace
left join pg_policy policy on policy.polrelid = relation.oid
where relation_ns.nspname = 'public'
  and relation.relname in (
    'patient_medical_records',
    'patient_lab_results',
    'patient_medical_documents',
    'medwell_medical_record_releases',
    'medwell_medical_release_audit'
  )
order by relation.relname, policy.polname;

-- Existing clinical RPC signatures and privilege settings.
select namespace.nspname as schema_name,
       procedure.proname as function_name,
       pg_get_function_identity_arguments(procedure.oid) as argument_signature,
       pg_get_function_result(procedure.oid) as return_type,
       procedure.prosecdef as security_definer,
       procedure.proconfig as function_settings,
       procedure.proacl as function_acl
from pg_proc procedure
join pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and (
    procedure.proname ilike '%clinical%'
    or procedure.proname ilike '%medical%'
    or procedure.proname ilike '%lab%'
    or procedure.proname ilike '%release%'
    or procedure.proname = 'billing_save_patient_bill'
    or procedure.proname = 'can_manage_patient_area'
    or procedure.proname = 'admin_admission_patient_directory'
  )
order by procedure.proname, argument_signature;
