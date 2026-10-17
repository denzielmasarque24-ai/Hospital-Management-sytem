-- Run in the Supabase SQL Editor. The bucket is public so saved product image
-- URLs can be rendered by the storefront. Only authorized staff can upload or
-- remove objects through the client.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select upper(coalesce(role, '')) from public.profiles where id = auth.uid() limit 1;
$$;
grant execute on function public.current_admin_role() to authenticated;

drop policy if exists "Public may read product images" on storage.objects;
create policy "Public may read product images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Product staff may upload images" on storage.objects;
create policy "Product staff may upload images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER')
  );

drop policy if exists "Product staff may delete images" on storage.objects;
create policy "Product staff may delete images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN', 'INVENTORY_MANAGER')
  );
