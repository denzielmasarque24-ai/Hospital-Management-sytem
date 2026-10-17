-- Public read-only projections keep doctor contact and license data private.
create or replace view public.public_doctors as
select id, first_name, last_name, specialization, photo_url, availability_schedule
from public.doctors
where status = 'active';
grant select on public.public_doctors to anon, authenticated;

-- A narrow projection for contact details used on public pages.
create or replace view public.public_site_contact as
select
  coalesce(nullif(content->>'phone', ''), '+1 234 567 8900') as phone,
  coalesce(nullif(content->>'siteEmail', ''), 'info@mediwell.com') as email,
  nullif(content->>'address', '') as address,
  nullif(content->>'operatingHours', '') as operating_hours
from public.website_content
where content_key = 'settings'
limit 1;
grant select on public.public_site_contact to anon, authenticated;

-- Service-specific details for the services requested on the public site.
update public.services set
  benefits = array['Early disease detection', 'Accurate testing results', 'Modern diagnostic equipment', 'Faster treatment planning'],
  treatments = array['Laboratory Testing', 'Blood Analysis', 'X-Ray', 'Ultrasound', 'CT Scan', 'MRI', 'ECG'],
  updated_at = now()
where slug = 'diagnostics';

update public.services set
  benefits = array['Heart health monitoring', 'Cardiovascular risk assessment', 'Early heart disease detection', 'Personalized treatment plans'],
  treatments = array['ECG', 'Echocardiogram', 'Stress Test', 'Blood Pressure Monitoring', 'Heart Screening'],
  updated_at = now()
where slug = 'cardiology';

update public.services set
  benefits = array['Evaluation of neurological symptoms', 'Support for early diagnosis', 'Assessment tailored to each patient', 'Coordinated treatment planning'],
  treatments = array['EEG', 'Brain Imaging', 'Nerve Conduction Studies', 'Neurological Consultation'],
  updated_at = now()
where slug = 'neurology';
