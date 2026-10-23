-- Allow the public catalog to read only active products while keeping writes
-- limited to authorized inventory roles.
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists slug text;
alter table public.products add column if not exists min_stock integer not null default 0;
alter table public.products add column if not exists status text not null default 'active';
alter table public.products add column if not exists description text not null default '';
alter table public.products add column if not exists image text;
alter table public.products add column if not exists image_url text;

-- Fill only missing legacy slugs; existing product slugs remain unchanged.
update public.products
set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(id::text), 1, 6)
where slug is null or btrim(slug) = '';

-- Preserve legacy image URLs while making the current image field available.
update public.products
set image = coalesce(image, image_url),
    image_url = coalesce(image_url, image)
where image is null or image_url is null;

create unique index if not exists products_sku_unique_idx
  on public.products (sku) where sku is not null;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select upper(coalesce(role, '')) from public.profiles where id = auth.uid() limit 1;
$$;

alter table public.products enable row level security;
drop policy if exists "admin staff manage products" on public.products;
create policy "admin staff manage products"
  on public.products
  for all
  to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER'));

grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant execute on function public.current_admin_role() to authenticated;

drop policy if exists "public can read active products" on public.products;
create policy "public can read active products"
  on public.products
  for select
  to anon, authenticated
  using (available is true);

-- Seed the requested catalog without changing existing product records.
insert into public.products
  (name, slug, category, price, stock, description, image_url, prescription_required, available)
select seed.name, seed.slug, seed.category, seed.price, seed.stock, seed.description, seed.image, false, true
from (values
  ('ApexRelief Plus', 'apexrelief-plus', 'Prescription Medicines', 24.00::numeric, 86, 'Targeted pain relief with long-lasting support.', 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80'),
  ('PureVital Multivitamin', 'purevital-multivitamin', 'Vitamins & Supplements', 18.50::numeric, 142, 'Essential vitamins to boost daily wellness.', 'https://images.unsplash.com/photo-1550572017-edd951b55104?auto=format&fit=crop&w=800&q=80'),
  ('FlexGuard Support', 'flexguard-support', 'Medical Devices', 39.00::numeric, 34, 'Comfort support for mobility and recovery.', 'https://images.unsplash.com/photo-1580281658628-67d5a1e8a194?auto=format&fit=crop&w=800&q=80'),
  ('GentleCare Hand Wash', 'gentlecare-hand-wash', 'Personal Care', 12.00::numeric, 61, 'Skin-friendly hygiene care for everyday use.', 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=80'),
  ('HeartCare Capsules', 'heartcare-capsules', 'Prescription Medicines', 29.00::numeric, 48, 'Comprehensive support for heart wellness.', 'https://images.unsplash.com/photo-1577401239170-897942555fb3?auto=format&fit=crop&w=800&q=80'),
  ('Daily Balance Gummies', 'daily-balance-gummies', 'Wellness Products', 22.00::numeric, 73, 'Natural wellness support for daily energy.', 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=800&q=80'),
  ('CalmCare Syrup', 'calmcare-syrup', 'Over-the-Counter', 16.00::numeric, 29, 'Trusted relief for seasonal discomfort.', 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?auto=format&fit=crop&w=800&q=80'),
  ('CareSense Monitor', 'caresense-monitor', 'Medical Devices', 59.00::numeric, 17, 'Accurate monitoring for at-home health routines.', 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=800&q=80')
) as seed(name, slug, category, price, stock, description, image)
where not exists (
  select 1 from public.products existing
  where lower(existing.slug) = lower(seed.slug)
     or lower(existing.name) = lower(seed.name)
)
on conflict do nothing;
