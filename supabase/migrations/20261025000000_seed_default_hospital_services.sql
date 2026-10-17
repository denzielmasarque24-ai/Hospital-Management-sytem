-- Keep the ten default hospital services available on the public website.
-- Existing records are matched by their unique slug; IDs remain database-generated.
insert into public.services as existing_service
  (name, slug, short_description, description, image_url, available, icon, price)
values
  ('Specialist Consultation', 'specialist-consultation', 'Expert medical consultations from experienced specialists.', 'Expert medical consultations from experienced specialists.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('Preventive Healthcare', 'preventive-healthcare', 'Health screenings and wellness programs.', 'Health screenings and wellness programs.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('Diagnostics', 'diagnostics', 'Advanced diagnostic testing and imaging services.', 'Advanced diagnostic testing and imaging services.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('General Medicine', 'general-medicine', 'Comprehensive primary healthcare services.', 'Comprehensive primary healthcare services.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('Emergency Care', 'emergency-care', '24/7 emergency medical assistance.', '24/7 emergency medical assistance.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('Pediatrics', 'pediatrics', 'Healthcare services for infants, children, and adolescents.', 'Healthcare services for infants, children, and adolescents.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('Pathology Lab', 'pathology-lab', 'Accurate laboratory testing and analysis.', 'Accurate laboratory testing and analysis.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('Neurology', 'neurology', 'Diagnosis and treatment of neurological conditions.', 'Diagnosis and treatment of neurological conditions.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('Pharmacy', 'pharmacy', 'Prescription medicines and pharmaceutical care.', 'Prescription medicines and pharmaceutical care.', '/images/services/medical-placeholder.svg', true, '', 0),
  ('Cardiology', 'cardiology', 'Specialized heart and cardiovascular care.', 'Specialized heart and cardiovascular care.', '/images/services/medical-placeholder.svg', true, '', 0)
on conflict (slug) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  description = case
    when btrim(coalesce(existing_service.description, '')) = '' then excluded.description
    else existing_service.description
  end,
  image_url = coalesce(nullif(btrim(existing_service.image_url), ''), excluded.image_url),
  available = true,
  updated_at = now();
