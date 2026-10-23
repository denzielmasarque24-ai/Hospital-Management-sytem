-- Publish only approved doctor profile fields. Private contact and license data
-- stays in doctors, whose existing RLS policies remain unchanged.
do $migration$
declare
  columns text[];
  id_column text;
  first_column text;
  last_column text;
  name_column text;
  specialty_column text;
  photo_column text;
  availability_column text;
  experience_column text;
  title_column text;
  biography_column text;
  status_column text;
  active_column text;
  published_column text;
  where_clause text;
  select_sql text;
begin
  select array_agg(column_name order by ordinal_position)
    into columns
    from information_schema.columns
   where table_schema = 'public' and table_name = 'doctors';

  if columns is null then
    raise exception 'Cannot create public_doctors: public.doctors does not exist.';
  end if;

  id_column := case when 'id' = any(columns) then 'id' end;
  first_column := case when 'first_name' = any(columns) then 'first_name' when 'given_name' = any(columns) then 'given_name' end;
  last_column := case when 'last_name' = any(columns) then 'last_name' when 'family_name' = any(columns) then 'family_name' end;
  name_column := case when 'display_name' = any(columns) then 'display_name' when 'full_name' = any(columns) then 'full_name' when 'name' = any(columns) then 'name' end;
  specialty_column := case when 'specialization' = any(columns) then 'specialization' when 'specialty' = any(columns) then 'specialty' end;
  photo_column := case when 'photo_url' = any(columns) then 'photo_url' when 'image_url' = any(columns) then 'image_url' when 'avatar_url' = any(columns) then 'avatar_url' when 'photo' = any(columns) then 'photo' end;
  availability_column := case when 'availability_schedule' = any(columns) then 'availability_schedule' when 'availability' = any(columns) then 'availability' end;
  experience_column := case when 'experience' = any(columns) then 'experience' when 'years_experience' = any(columns) then 'years_experience' end;
  title_column := case when 'professional_title' = any(columns) then 'professional_title' when 'title' = any(columns) then 'title' end;
  biography_column := case when 'biography' = any(columns) then 'biography' when 'bio' = any(columns) then 'bio' when 'description' = any(columns) then 'description' end;
  status_column := case when 'status' = any(columns) then 'status' end;
  active_column := case when 'is_active' = any(columns) then 'is_active' end;
  published_column := case when 'is_published' = any(columns) then 'is_published' end;

  if id_column is null or specialty_column is null or (name_column is null and (first_column is null or last_column is null)) then
    raise exception 'Cannot safely create public_doctors from public.doctors columns (%). Expected id, specialization/specialty, and display_name/full_name/name or first_name plus last_name.', array_to_string(columns, ', ');
  end if;

  if status_column is null and active_column is null and published_column is null then
    raise exception 'Cannot safely create public_doctors from public.doctors columns (%). Expected a status, is_active, or is_published column to restrict public profiles.', array_to_string(columns, ', ');
  end if;

  if status_column is not null then
    where_clause := format('lower(coalesce(d.%I::text, '''')) in (''active'', ''published'')', status_column);
  elsif active_column is not null then
    where_clause := format('coalesce(d.%I, false)', active_column);
  elsif published_column is not null then
    where_clause := format('coalesce(d.%I, false)', published_column);
  end if;

  select_sql := format('d.%I as id, ', id_column);
  if first_column is not null then select_sql := select_sql || format('d.%I::text as first_name, ', first_column);
  else select_sql := select_sql || 'null::text as first_name, '; end if;
  if last_column is not null then select_sql := select_sql || format('d.%I::text as last_name, ', last_column);
  else select_sql := select_sql || 'null::text as last_name, '; end if;
  select_sql := select_sql || format('d.%I::text as specialization, ', specialty_column);
  if photo_column is not null then select_sql := select_sql || format('d.%I::text as photo_url, ', photo_column);
  else select_sql := select_sql || 'null::text as photo_url, '; end if;
  if availability_column is not null then select_sql := select_sql || format('d.%I::text as availability_schedule, ', availability_column);
  else select_sql := select_sql || 'null::text as availability_schedule, '; end if;
  if experience_column is not null then select_sql := select_sql || format('d.%I::text as experience ', experience_column);
  else select_sql := select_sql || 'null::text as experience '; end if;

  -- Keep the first seven columns in the original public_doctors order so an
  -- existing view can be upgraded with CREATE OR REPLACE VIEW safely.
  select_sql := select_sql || ', ';
  if name_column is not null then select_sql := select_sql || format('d.%I::text as display_name, ', name_column);
  else select_sql := select_sql || 'null::text as display_name, '; end if;
  if title_column is not null then select_sql := select_sql || format('d.%I::text as professional_title, ', title_column);
  else select_sql := select_sql || 'null::text as professional_title, '; end if;
  if biography_column is not null then select_sql := select_sql || format('d.%I::text as biography ', biography_column);
  else select_sql := select_sql || 'null::text as biography '; end if;

  execute 'create or replace view public.public_doctors with (security_barrier = true) as select ' || select_sql || 'from public.doctors d where ' || where_clause;
  execute 'grant select on public.public_doctors to anon, authenticated';
end;
$migration$;
