begin;

-- related_conversation_id is the single stored reference for conversations.
-- p_record_id remains in the function signature for compatibility with the
-- existing appointment/order trigger functions, but it is intentionally not
-- written to a column that does not exist in the deployed notification table.
create or replace function public.create_admin_event_notifications(
  p_type text,
  p_title text,
  p_body text,
  p_event_key text,
  p_conversation_id uuid default null,
  p_record_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_notifications (
    recipient_id,
    type,
    title,
    body,
    related_conversation_id,
    event_key
  )
  select
    profile.id,
    p_type,
    p_title,
    p_body,
    p_conversation_id,
    p_event_key
  from public.profiles as profile
  where upper(coalesce(profile.role, '')) in ('ADMIN', 'SUPER_ADMIN')
  on conflict (recipient_id, event_key) do nothing;
end;
$$;

revoke all on function public.create_admin_event_notifications(text, text, text, text, uuid, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
