insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doctor-photos', 'doctor-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "public read doctor photos" on storage.objects;
create policy "public read doctor photos" on storage.objects for select to anon, authenticated
  using (bucket_id = 'doctor-photos');
drop policy if exists "admins upload doctor photos" on storage.objects;
create policy "admins upload doctor photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'doctor-photos' and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
drop policy if exists "admins update doctor photos" on storage.objects;
create policy "admins update doctor photos" on storage.objects for update to authenticated
  using (bucket_id = 'doctor-photos' and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (bucket_id = 'doctor-photos' and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
drop policy if exists "admins delete doctor photos" on storage.objects;
create policy "admins delete doctor photos" on storage.objects for delete to authenticated
  using (bucket_id = 'doctor-photos' and public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
