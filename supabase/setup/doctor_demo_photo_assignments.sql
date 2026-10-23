-- Assign the user-confirmed D8-D20 mappings to the existing demo doctors.
-- Changes only image_url. Doctors 1-7 are intentionally outside this update.
begin;

do $assign_photos$
declare
  matched integer;
  changed integer;
  proposed jsonb := '[
    {"id":"72ea804b-611a-4586-a99c-7daf9cf1a7e7","name":"Dr. Ethan Mercado","path":"/images/doctors/d8.png"},
    {"id":"c0fa5a5b-3410-4c2c-8b68-2eecde4f60bb","name":"Dr. Gabriel Flores","path":"/images/doctors/d9.jpg"},
    {"id":"d96507bd-3bfc-4368-bb2b-f7ac0a159b10","name":"Dr. Isabella Torres","path":"/images/doctors/d10.jpg"},
    {"id":"9a3758ac-73f1-4039-9239-f9d4069cf911","name":"Dr. Juan Reyes","path":"/images/doctors/d11.jpg"},
    {"id":"3ac82c55-0fe9-4090-a280-69f2561718bb","name":"Dr. Lucas Herrera","path":"/images/doctors/d12.jpg"},
    {"id":"8566be7d-1aa8-406c-8807-23e0d6d4be0b","name":"Dr. Maria Santos","path":"/images/doctors/d13.jpg"},
    {"id":"9ee4c5d3-5e3d-4e66-b389-4a52cb583579","name":"Dr. Miguel Garcia","path":"/images/doctors/d14.jpg"},
    {"id":"b2990cf2-d339-4b75-980f-060a5781e4a5","name":"Dr. Nathan Villanueva","path":"/images/doctors/d15.jpg"},
    {"id":"dd65fb50-a096-4a26-8183-f6d15e6ec9dc","name":"Dr. Nicole Fernandez","path":"/images/doctors/d16.jpg"},
    {"id":"0a705a7e-df96-443a-92d7-da11ccac0933","name":"Dr. Patricia Ramos","path":"/images/doctors/d17.jpg"},
    {"id":"e3fe840c-59d8-423d-9939-4427d88af45c","name":"Dr. Rafael Lim","path":"/images/doctors/d18.jpg"},
    {"id":"15906854-3dea-473a-b65b-d168e6bea108","name":"Dr. Samuel Co","path":"/images/doctors/d19.jpg"},
    {"id":"a691fb37-2a11-418c-b7b8-0cfe7f405855","name":"Dr. Sofia Mendoza","path":"/images/doctors/d20.jpg"}
  ]';
begin
  select count(*) into matched
  from public.doctors d
  join jsonb_to_recordset(proposed) as m(id uuid, name text, path text)
    on d.id = m.id and d.display_name = m.name
  where d.is_demo is true;

  if matched <> 13 then
    raise exception 'Expected all 13 matching demo UUID/name pairs; found %. No assignments applied.', matched;
  end if;

  if exists (
    select 1
    from public.doctors d
    join jsonb_to_recordset(proposed) as m(id uuid, name text, path text)
      on d.id = m.id and d.display_name = m.name
    where d.is_demo is true
      and nullif(btrim(d.image_url), '') is not null
      and d.image_url is distinct from m.path
  ) then
    raise exception 'A target doctor has a different nonempty image URL. Review assignments before applying.';
  end if;

  update public.doctors d
  set image_url = m.path
  from jsonb_to_recordset(proposed) as m(id uuid, name text, path text)
  where d.id = m.id and d.display_name = m.name and d.is_demo is true
    and nullif(btrim(d.image_url), '') is null;

  get diagnostics changed = row_count;
  raise notice 'Assigned % previously empty D8-D20 image URLs. Matching existing URLs were preserved.', changed;
end;
$assign_photos$;

select d.id, d.display_name, d.image_url
from public.doctors d
where d.id in (
  '72ea804b-611a-4586-a99c-7daf9cf1a7e7', 'c0fa5a5b-3410-4c2c-8b68-2eecde4f60bb',
  'd96507bd-3bfc-4368-bb2b-f7ac0a159b10', '9a3758ac-73f1-4039-9239-f9d4069cf911',
  '3ac82c55-0fe9-4090-a280-69f2561718bb', '8566be7d-1aa8-406c-8807-23e0d6d4be0b',
  '9ee4c5d3-5e3d-4e66-b389-4a52cb583579', 'b2990cf2-d339-4b75-980f-060a5781e4a5',
  'dd65fb50-a096-4a26-8183-f6d15e6ec9dc', '0a705a7e-df96-443a-92d7-da11ccac0933',
  'e3fe840c-59d8-423d-9939-4427d88af45c', '15906854-3dea-473a-b65b-d168e6bea108',
  'a691fb37-2a11-418c-b7b8-0cfe7f405855'
)
order by display_name, id;

commit;
