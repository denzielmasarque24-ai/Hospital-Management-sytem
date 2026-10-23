begin;

-- Restore the admin payment-attempt listing RPC when the payment migration was
-- not applied to an environment or PostgREST has not exposed its signature.
-- This returns attempts only; an empty result is a successful empty history.
create or replace function public.payment_admin_summary()
returns table(
  id uuid,
  patient_id uuid,
  bill_id uuid,
  bill_number text,
  amount numeric,
  refunded_amount numeric,
  currency text,
  payment_method text,
  status text,
  checkout_session_id text,
  provider_payment_id text,
  paid_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if coalesce(public.current_admin_role(), '') not in ('ADMIN', 'SUPER_ADMIN') then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select
    payment.id,
    payment.patient_id,
    payment.bill_id,
    bill.bill_number,
    payment.amount,
    payment.refunded_amount,
    payment.currency,
    payment.payment_method,
    payment.status,
    payment.checkout_session_id,
    payment.provider_payment_id,
    payment.paid_at,
    payment.created_at,
    payment.updated_at
  from public.online_payments as payment
  inner join public.patient_bills as bill on bill.id = payment.bill_id
  order by payment.created_at desc
  limit 500;
end;
$function$;

revoke all on function public.payment_admin_summary() from public, anon;
grant execute on function public.payment_admin_summary() to authenticated;

notify pgrst, 'reload schema';

commit;
