-- Run after applying the careers/services migration. Service images are public-read,
-- while upload/update/delete require an authenticated ADMIN or SUPER_ADMIN profile.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-images', 'service-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "public read service images" on storage.objects;
create policy "public read service images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'service-images');
drop policy if exists "admins upload service images" on storage.objects;
create policy "admins upload service images" on storage.objects for insert to authenticated
  with check (bucket_id = 'service-images' and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
drop policy if exists "admins update service images" on storage.objects;
create policy "admins update service images" on storage.objects for update to authenticated
  using (bucket_id = 'service-images' and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (bucket_id = 'service-images' and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
drop policy if exists "admins delete service images" on storage.objects;
create policy "admins delete service images" on storage.objects for delete to authenticated
  using (bucket_id = 'service-images' and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
