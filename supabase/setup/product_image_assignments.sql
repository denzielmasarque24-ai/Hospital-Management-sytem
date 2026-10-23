-- Idempotently attach the verified local product images to existing records.
-- The live products schema uses image_url. No products or columns are created.
begin;

do $assign_product_images$
declare
  matched integer;
  changed integer;
  proposed jsonb := '[
    {"id":"5bada452-a3a1-4c8d-a52a-59362482cc18","name":"Absorbable Surgical Sutures","path":"/images/products/absorbable-surgical-sutures.png"},
    {"id":"c4a0cde9-2d5c-4a93-90e4-ae8287c12475","name":"Adson Tissue Forceps","path":"/images/products/adson-tissue-forceps.png"},
    {"id":"5b0eabad-450d-4085-8a69-fb7c9ad5cf5b","name":"Alcohol 70% 500ml","path":"/images/products/alcohol-70-500ml.png"},
    {"id":"a4680885-cca5-4b62-ab9a-a542af712964","name":"Amlodipine 5mg Tablets","path":"/images/products/amlodipine-5mg-tablets.png"},
    {"id":"471df4e7-485b-42c7-8ceb-cef24c107d66","name":"Amoxicillin 500mg Capsules","path":"/images/products/amoxicillin-500mg-capsules.png"},
    {"id":"3af6136b-8f1d-4c2a-9613-4da63ed743ef","name":"ApexRelief Plus","path":"/images/products/apexrelief-plus.png"},
    {"id":"f3a78a60-150b-49d9-ba52-15e7d46f1c77","name":"Atorvastatin 20mg Tablets","path":"/images/products/atorvastatin-20mg-tablets.png"},
    {"id":"6c3207c2-ad78-4aae-8216-0a189f63df3a","name":"Antacid Chewable Tablets","path":"/images/products/antacid-chewable-tablets.png"},
    {"id":"00a10822-4855-4552-ae9c-ff2c7d9bfd7a","name":"Antibacterial Hand Wash 250ml","path":"/images/products/antibacterial-hand-wash-250ml.png"},
    {"id":"92562039-5b07-49ca-aaea-27063b45ecb2","name":"Army-Navy Retractor","path":"/images/products/army-navy-retractor.png"},
    {"id":"8e134117-0d10-43bf-9429-da2df7fc4eb8","name":"Blood Glucose Meter","path":"/images/products/blood-glucose-meter.png"},
    {"id":"2f3589bb-0d31-4223-89fa-d8b21f5c72d7","name":"Calcium + Vitamin D Tablets","path":"/images/products/calcium-vitamin-d-tablets.png"},
    {"id":"f6e4c9df-5f85-4508-a47a-31d9619810f8","name":"CalmCare Syrup","path":"/images/products/calmcare-syrup.png"},
    {"id":"d91ffedb-c755-49e7-a435-71b34d193ee1","name":"CareSense Monitor","path":"/images/products/caresense-monitor.png"},
    {"id":"7bdf735b-216e-4910-9905-dbd65f89b486","name":"Cetirizine 10mg Tablets","path":"/images/products/cetirizine-10mg-tablets.png"},
    {"id":"4797fbef-2035-4418-9078-d7d40c5a2a28","name":"Daily Balance Gummies","path":"/images/products/daily-balance-gummies.png"},
    {"id":"1520b7bc-676d-4af1-8e56-5002daee90cc","name":"Digital Blood Pressure Monitor","path":"/images/products/digital-blood-pressure-monitor.png"},
    {"id":"f5590fa6-9e09-41ca-a634-b04d8af50df7","name":"Digital Thermometer","path":"/images/products/digital-thermometer.png"},
    {"id":"61513645-9cfc-46af-9083-174803a2150f","name":"Digital Weighing Scale","path":"/images/products/digital-weighing-scale.png"},
    {"id":"bedcf65b-10bf-4d61-ae08-97270d04d9bd","name":"Disposable Face Masks (50 pcs)","path":"/images/products/disposable-face-masks-50-pcs.png"},
    {"id":"9a7858da-9229-4709-a8d7-1a3e8dc38dea","name":"Disposable Surgical Gown","path":"/images/products/disposable-surgical-gown.png"},
    {"id":"9c7c31df-152d-45e7-9dc9-8b2f6e2dcce9","name":"Elastic Support Bandage","path":"/images/products/elastic-support-bandage.png"},
    {"id":"d452ac01-2f89-4db9-be6e-b2177507fdbc","name":"Electrosurgical Pencil","path":"/images/products/electrosurgical-pencil.png"},
    {"id":"a56c080f-a03c-4cf7-b6a8-75f3459b05bf","name":"FlexGuard Support","path":"/images/products/flexguard-support.png"},
    {"id":"da2d6342-1da2-4edb-8985-9495ad2e33c4","name":"Gentle Body Wash 250ml","path":"/images/products/gentle-body-wash-250ml.png"},
    {"id":"e9f9d0c5-6d4a-4520-b758-3042255862a2","name":"GentleCare Hand Wash","path":"/images/products/gentlecare-hand-wash.png"},
    {"id":"1f49e3f6-e8a1-4637-ae60-b518c3706de8","name":"Hand Sanitizer 100ml","path":"/images/products/hand-sanitizer-100ml.png"},
    {"id":"4eebec9a-a936-471b-9036-7f4b03e4974f","name":"HeartCare Capsules","path":"/images/products/heartcare-capsules.png"},
    {"id":"37852b85-5f4f-458a-8377-dcceaa7a9da6","name":"Hot & Cold Gel Pack","path":"/images/products/hot-cold-gel-pack.png"},
    {"id":"d47ff061-8044-424b-875a-b2933d7bfa28","name":"Kelly Hemostatic Forceps","path":"/images/products/kelly-hemostatic-forceps.png"},
    {"id":"6d1c414a-a58d-4c88-a9ef-40d110978a83","name":"Mayo Surgical Scissors","path":"/images/products/mayo-surgical-scissors.png"},
    {"id":"97590dbd-6c31-4afe-b7de-ad2dcae5ea29","name":"Mayo-Hegar Needle Holder","path":"/images/products/mayo-hegar-needle-holder.png"},
    {"id":"04516214-404b-4cdd-bdb8-6c60fc2a6b74","name":"Metformin 500mg Tablets","path":"/images/products/metformin-500mg-tablets.png"},
    {"id":"a1d26c5a-dd1c-44ac-999d-ce4198a5dc8c","name":"Metzenbaum Dissecting Scissors","path":"/images/products/metzenbaum-dissecting-scissors.png"},
    {"id":"ce5184a6-bfa0-4aed-9ace-d8e4cea13c3f","name":"Mosquito Hemostatic Forceps","path":"/images/products/mosquito-hemostatic-forceps.png"},
    {"id":"605382a3-ae77-4327-81f0-a5e5f1452ff9","name":"Multivitamins Capsules","path":"/images/products/multivitamins-capsules.png"},
    {"id":"80accf45-7b8e-46d3-ac70-736039dceae5","name":"Nebulizer Machine","path":"/images/products/nebulizer-machine.png"},
    {"id":"ea45dd0a-433c-41cf-8a38-ea53e829c63a","name":"Oral Rehydration Salts Sachet","path":"/images/products/oral-rehydration-salts-sachet.png"}
  ]';
begin
  select count(*) into matched
  from public.products p
  join jsonb_to_recordset(proposed) as m(id uuid, name text, path text)
    on p.id = m.id and p.name = m.name;

  if matched <> 38 then
    raise exception 'Expected 38 matching product UUID/name pairs; found %. No image URLs were changed.', matched;
  end if;

  if exists (
    select 1
    from public.products p
    join jsonb_to_recordset(proposed) as m(id uuid, name text, path text)
      on p.id = m.id and p.name = m.name
    where nullif(btrim(p.image_url), '') is not null
      and p.image_url is distinct from m.path
  ) then
    raise exception 'A matched product has a different nonempty image_url. Review before applying.';
  end if;

  update public.products p
  set image_url = m.path
  from jsonb_to_recordset(proposed) as m(id uuid, name text, path text)
  where p.id = m.id and p.name = m.name
    and nullif(btrim(p.image_url), '') is null;

  get diagnostics changed = row_count;
  raise notice 'Assigned % previously empty product image URLs. Existing matching paths were preserved.', changed;
end;
$assign_product_images$;

select p.id, p.name, p.image_url
from public.products p
where p.id in (
  '5bada452-a3a1-4c8d-a52a-59362482cc18', 'c4a0cde9-2d5c-4a93-90e4-ae8287c12475',
  '5b0eabad-450d-4085-8a69-fb7c9ad5cf5b', 'a4680885-cca5-4b62-ab9a-a542af712964',
  '471df4e7-485b-42c7-8ceb-cef24c107d66', '3af6136b-8f1d-4c2a-9613-4da63ed743ef',
  'f3a78a60-150b-49d9-ba52-15e7d46f1c77', '6c3207c2-ad78-4aae-8216-0a189f63df3a',
  '00a10822-4855-4552-ae9c-ff2c7d9bfd7a', '92562039-5b07-49ca-aaea-27063b45ecb2',
  '8e134117-0d10-43bf-9429-da2df7fc4eb8', '2f3589bb-0d31-4223-89fa-d8b21f5c72d7',
  'f6e4c9df-5f85-4508-a47a-31d9619810f8', 'd91ffedb-c755-49e7-a435-71b34d193ee1',
  '7bdf735b-216e-4910-9905-dbd65f89b486', '4797fbef-2035-4418-9078-d7d40c5a2a28',
  '1520b7bc-676d-4af1-8e56-5002daee90cc', 'f5590fa6-9e09-41ca-a634-b04d8af50df7',
  '61513645-9cfc-46af-9083-174803a2150f', 'bedcf65b-10bf-4d61-ae08-97270d04d9bd',
  '9a7858da-9229-4709-a8d7-1a3e8dc38dea', '9c7c31df-152d-45e7-9dc9-8b2f6e2dcce9',
  'd452ac01-2f89-4db9-be6e-b2177507fdbc', 'a56c080f-a03c-4cf7-b6a8-75f3459b05bf',
  'da2d6342-1da2-4edb-8985-9495ad2e33c4', 'e9f9d0c5-6d4a-4520-b758-3042255862a2',
  '1f49e3f6-e8a1-4637-ae60-b518c3706de8', '4eebec9a-a936-471b-9036-7f4b03e4974f',
  '37852b85-5f4f-458a-8377-dcceaa7a9da6', 'd47ff061-8044-424b-875a-b2933d7bfa28',
  '6d1c414a-a58d-4c88-a9ef-40d110978a83', '97590dbd-6c31-4afe-b7de-ad2dcae5ea29',
  '04516214-404b-4cdd-bdb8-6c60fc2a6b74', 'a1d26c5a-dd1c-44ac-999d-ce4198a5dc8c',
  'ce5184a6-bfa0-4aed-9ace-d8e4cea13c3f', '605382a3-ae77-4327-81f0-a5e5f1452ff9',
  '80accf45-7b8e-46d3-ac70-736039dceae5', 'ea45dd0a-433c-41cf-8a38-ea53e829c63a'
)
order by p.name, p.id;

commit;
