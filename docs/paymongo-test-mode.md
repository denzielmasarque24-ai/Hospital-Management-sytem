# PayMongo test mode setup

Online checkout is deliberately test-only. The payment routes stay unavailable until every required server variable is present and the merchant methods are explicitly enabled.

Copy `.env.example` to `.env.local` and configure:

- `PAYMONGO_MODE=test`
- `PAYMONGO_TEST_SECRET_KEY` with a PayMongo test secret key (`sk_test_...`)
- `PAYMONGO_TEST_WEBHOOK_SECRET` with the signing secret for the test webhook
- `PAYMONGO_ENABLED_METHODS` with only activated test methods: `gcash`, `paymaya`, or both
- `PAYMENT_DEMO_SIMULATION_ENABLED=true` only when you want the non-persistent GCash/Maya demo flow; this flow does not contact PayMongo or write payment records
- `SUPABASE_SERVICE_ROLE_KEY` on the server only
- `NEXT_PUBLIC_APP_URL` with the exact origin used in the browser

Apply `supabase/migrations/20261122000000_paymongo_online_payments.sql` to the intended Supabase project. The migration deliberately stops if existing online payments point to missing, mismatched, or demo bills, or if an old unresolved attempt lacks a reusable checkout reference. Reconcile those attempts before retrying the migration; do not delete or relabel bill records to get past the check.

Apply the subsequent billing/payment migrations, including `20261202000000_charge_based_payments_and_bill_approval.sql` and `20261203000000_demo_payment_simulations.sql`, in order. Demo simulations are stored separately from real payment records, are protected by patient ownership checks and RLS, and are never valid receipts or real revenue. Set `PAYMENT_DEMO_SIMULATION_ENABLED=true` only in a development/test environment when you want patients to exercise the fictional flow; leave it false otherwise.

Register the deployed HTTPS endpoint `/api/payments/webhook` in the PayMongo test dashboard and subscribe to `checkout_session.payment.paid` and `refund.succeeded`. Set its webhook signing secret in `PAYMONGO_TEST_WEBHOOK_SECRET`. Return redirects do not update billing; the signed webhook records payment and refund events.

Use the test dashboard’s sandbox flows to verify GCash, Maya, failed and abandoned checkouts, duplicate requests and webhook deliveries, wrong-patient access, demo bill rejection, partial payments, refunds, receipt access, and billing staff monitoring. Live keys and live webhook secrets are not read by the application.
