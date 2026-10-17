-- Add public detail content to services without changing existing rows or RLS.
alter table public.services
  add column if not exists benefits text[] not null default '{}',
  add column if not exists treatments text[] not null default '{}',
  add column if not exists related_specializations text[] not null default '{}';

-- Seed useful detail copy only where an admin has not already supplied it.
update public.services as service
set benefits = case service.slug
      when 'specialist-consultation' then array['Personalized guidance from experienced clinicians', 'Clear care plans based on your health needs', 'Support coordinating follow-up care']::text[]
      when 'preventive-healthcare' then array['Identify health risks early', 'Build a practical wellness plan', 'Stay up to date with routine screenings']::text[]
      when 'diagnostics' then array['Timely results to support clinical decisions', 'Modern testing and imaging options', 'Care guidance from qualified professionals']::text[]
      when 'general-medicine' then array['Coordinated care for common health concerns', 'Support for ongoing health needs', 'Referrals when specialist care is appropriate']::text[]
      when 'emergency-care' then array['Prompt assessment of urgent health concerns', 'Immediate access to medical assistance', 'Guidance on next steps and follow-up care']::text[]
      when 'pediatrics' then array['Age-appropriate care for growing children', 'Support for parents and caregivers', 'Guidance on child wellness and development']::text[]
      when 'pathology-lab' then array['Reliable laboratory analysis', 'Testing that supports diagnosis and monitoring', 'Clear results for your care team']::text[]
      when 'neurology' then array['Assessment of nervous system concerns', 'Care planning for neurological conditions', 'Coordination with other specialists when needed']::text[]
      when 'pharmacy' then array['Access to prescription medicines', 'Medication-use guidance', 'Support with ongoing pharmaceutical care']::text[]
      when 'cardiology' then array['Focused assessment of heart health', 'Support managing cardiovascular risk', 'Personalized follow-up recommendations']::text[]
      else service.benefits end,
    treatments = case service.slug
      when 'specialist-consultation' then array['Specialist assessment', 'Care plan review', 'Follow-up consultation']::text[]
      when 'preventive-healthcare' then array['Routine health screening', 'Wellness consultation', 'Preventive care planning']::text[]
      when 'diagnostics' then array['Diagnostic testing', 'Imaging referrals', 'Results consultation']::text[]
      when 'general-medicine' then array['Primary care consultation', 'Common illness assessment', 'Chronic condition follow-up']::text[]
      when 'emergency-care' then array['Urgent medical assessment', 'Initial stabilization', 'Emergency referral coordination']::text[]
      when 'pediatrics' then array['Child health consultation', 'Growth and development review', 'Common childhood illness care']::text[]
      when 'pathology-lab' then array['Specimen collection', 'Clinical laboratory testing', 'Laboratory result reporting']::text[]
      when 'neurology' then array['Neurological assessment', 'Symptom evaluation', 'Care and referral planning']::text[]
      when 'pharmacy' then array['Prescription dispensing', 'Medication counseling', 'Medication review']::text[]
      when 'cardiology' then array['Cardiovascular consultation', 'Heart health risk review', 'Follow-up care planning']::text[]
      else service.treatments end,
    related_specializations = case service.slug
      when 'specialist-consultation' then array['General Medicine', 'Internal Medicine', 'Cardiology', 'Pediatrics']::text[]
      when 'preventive-healthcare' then array['General Medicine', 'Internal Medicine']::text[]
      when 'diagnostics' then array['General Medicine', 'Internal Medicine']::text[]
      when 'general-medicine' then array['General Medicine', 'Internal Medicine']::text[]
      when 'emergency-care' then array['General Medicine', 'Internal Medicine']::text[]
      when 'pediatrics' then array['Pediatrics']::text[]
      when 'pathology-lab' then array['General Medicine', 'Internal Medicine']::text[]
      when 'neurology' then array['Internal Medicine']::text[]
      when 'pharmacy' then array['General Medicine']::text[]
      when 'cardiology' then array['Cardiology']::text[]
      else service.related_specializations end,
    updated_at = now()
where (cardinality(service.benefits) = 0 or service.benefits is null)
   or (cardinality(service.treatments) = 0 or service.treatments is null)
   or (cardinality(service.related_specializations) = 0 or service.related_specializations is null);
