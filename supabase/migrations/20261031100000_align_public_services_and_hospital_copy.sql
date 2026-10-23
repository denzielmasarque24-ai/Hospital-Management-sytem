-- The public services page and appointment form use `available` as the publish switch.
drop policy if exists "public read published services" on public.services;
drop policy if exists "public read available services" on public.services;
create policy "public read available services"
  on public.services for select to anon, authenticated
  using (available = true);

-- Remove legacy company wording from configured public descriptions.
update public.services
set short_description = replace(
      replace(short_description, 'MediWell Healthcare', 'MedWell Medical Hospital'),
      'MediWell Pharmacy', 'MedWell Medical Hospital Pharmacy'
    ),
    description = replace(
      replace(description, 'MediWell Healthcare', 'MedWell Medical Hospital'),
      'MediWell Pharmacy', 'MedWell Medical Hospital Pharmacy'
    )
where short_description ilike '%MediWell%' or description ilike '%MediWell%';

-- The original seed stated a 24/7 emergency capability without hospital details.
update public.services
set short_description = 'Emergency care information. Contact the hospital to confirm current availability.'
where slug = 'emergency-care'
  and short_description = '24/7 emergency medical assistance.';
