begin;

-- Payment recording is now performed by billing-authorized staff. Keep the
-- payment ledger and verified webhooks intact for existing records, but stop
-- patients from creating new real or simulated checkout attempts directly
-- through PostgREST RPC calls.
revoke all on function public.payment_prepare_checkout(uuid, text)
  from public, anon, authenticated;
revoke all on function public.payment_prepare_checkout_amount(uuid, text, numeric)
  from public, anon, authenticated;
revoke all on function public.create_demo_payment_simulation(uuid, numeric, text, uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
