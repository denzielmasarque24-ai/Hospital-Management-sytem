-- Public contact details should only be shown when configured by an administrator.
create or replace view public.public_site_contact as
select
  nullif(content->>'phone', '') as phone,
  nullif(content->>'siteEmail', '') as email,
  nullif(content->>'address', '') as address,
  nullif(content->>'operatingHours', '') as operating_hours
from public.website_content
where content_key = 'settings'
limit 1;

grant select on public.public_site_contact to anon, authenticated;

update public.website_content
set content = jsonb_set(content, '{siteName}', '"MedWell Medical Hospital"'::jsonb, true)
where content_key = 'settings' and content->>'siteName' = 'MediWell Pharma';
