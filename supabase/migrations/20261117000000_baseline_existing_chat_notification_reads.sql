begin;

-- Treat messages that predate per-user chat notifications as already seen.
-- This avoids turning the existing conversation history into a false unread backlog.
-- Messages created after the read-receipt rollout remain unread until viewed.
insert into public.message_read_receipts (message_id, user_id, read_at)
select m.id, c.patient_id, now()
from public.messages m
join public.conversations c on c.id = m.conversation_id
where m.sender_id <> c.patient_id
  and upper(m.sender_role) in ('ADMIN', 'STAFF')
on conflict (message_id, user_id) do nothing;

insert into public.message_read_receipts (message_id, user_id, read_at)
select m.id, p.id, now()
from public.messages m
join public.conversations c on c.id = m.conversation_id
join public.profiles p on lower(coalesce(p.role, '')) in ('admin', 'super_admin')
where m.sender_id <> p.id
  and upper(m.sender_role) = 'PATIENT'
on conflict (message_id, user_id) do nothing;

commit;
