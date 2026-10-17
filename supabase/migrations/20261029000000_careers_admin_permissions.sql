-- Keep career writes restricted to authenticated admins while making sure the Careers module can manage existing rows.
alter table public.careers enable row level security;

drop policy if exists "admins manage careers" on public.careers;
create policy "admins manage careers" on public.careers
  for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));

grant select on public.careers to anon, authenticated;
revoke insert, update, delete on public.careers from anon, public;
grant insert, update, delete on public.careers to authenticated;
