-- Allow only hospital administrators to review and update appointment requests.
-- Patient self-service access remains limited to each patient's own SELECT/INSERT.
grant update on public.appointments to authenticated;

drop policy if exists "Admins can read appointments" on public.appointments;
create policy "Admins can read appointments"
  on public.appointments for select to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));

drop policy if exists "Admins can update appointment status" on public.appointments;
create policy "Admins can update appointment status"
  on public.appointments for update to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
