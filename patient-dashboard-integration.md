# Patient dashboard integration

Implementation is connected to the requested tables. Live demo counts, deployed column relationships, and database RLS enforcement still need verification with an authorized patient session. The executed demo migration is not present in this workspace, and the public API does not expose protected table schemas.

## Functionality

- Appointments use the authenticated patient's ID, load related services and doctors, and display each appointment once. In-page filters expose upcoming, pending, confirmed, completed, cancelled, and historical appointments. Reschedule/cancellation requests retain their existing table and revalidate the authenticated user before insertion.
- Medical history reads `patient_medical_records`, `lab_test_bookings`, and related `lab_tests`. Four category filters work. Explicit booking links merge booking context into one clinical timeline entry. Completed bookings do not imply a verified result. Draft records are excluded from display in addition to database RLS.
- Doctor assignments exclude ended or inactive assignments, resolve `doctors`, and show available contact fields. The page has no assignment editing controls.
- Admissions distinguish active stays from discharged/cancelled/pending records. A discharge date always takes precedence over an active status.
- Room information resolves `hospital_rooms` through admission room IDs, with separate current and historical groups. Discharged stays never appear as current rooms.
- Billing itemizes `patient_medical_charges` linked to each bill. Only explicitly completed/paid/succeeded payments reduce the balance. Amounts are rounded to cents, formatted as Philippine pesos, and calculated from records. Invoices lacking charge detail show unavailable totals rather than a false zero balance.
- Supplies query `category = 'medical_supply'`, share billing's charge calculation, and link to the related invoice module.
- Demo indicators use record flags/metadata and explicit DEMO reference prefixes. Demo financial records have disabled payment/receipt actions, including when demo status is inherited from their bill. Actual non-demo receipt links remain available.
- Authenticated, verified patient sessions are required. All patient-table queries filter by that user's ID. Related doctor, room, service, and test queries use IDs from those patient-owned records. Reads use the existing cookie-aware Supabase client and public key; database RLS remains in force.
- Queries paginate, surface failures with safe reference codes, and have retry/error UI. Existing responsive theme and loading skeletons are retained.

## Files changed for this task

- `app/(patient)/patient/[section]/page.tsx`
- `app/(patient)/patient/appointments/page.tsx`
- `app/(patient)/patient/layout.tsx`
- `app/(patient)/patient/error.tsx` (new)
- `app/(patient)/patient/patient.css`
- `components/patient/PatientSectionContent.tsx` (new)
- `components/patient/PatientMedicalHistory.tsx`
- `components/patient/PatientAppointments.tsx`
- `lib/patient/dashboard.mjs` (new)
- `lib/patient/queries.mjs` (new)
- `tests/patient-dashboard.test.mjs` (new)
- `tests/patient-dashboard-ui.test.mjs` (new)
- `scripts/verify-patient-dashboard.mjs` (new)
- `supabase/setup/patient_dashboard_read_audit.sql` (new, read only)

No tables were recreated, records inserted/updated/deleted, or database policies changed. Existing admin and authentication implementation files were not changed by this task.

## Validation

Run automated checks:

```powershell
node --test tests/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/next/dist/bin/next build
```

The fixture checks include five charges totaling PHP 3,930, a completed PHP 2,000 payment, PHP 1,930 outstanding, two supply charges, historical rooms, linked CBC de-duplication, filters, demo action disabling, pagination, ownership filters, and explicit missing-table/permission errors. Fixture tests are not proof of deployed RLS.

## Live verification remaining

Use an existing authorized patient's short-lived access token in the process environment as `DEMO_PATIENT_ACCESS_TOKEN`; do not paste it into chat, source files, or logs. With the public Supabase settings in `.env.local`, run:

```powershell
node --env-file=.env.local scripts/verify-patient-dashboard.mjs --expect-demo
```

The script only reads data. It checks the authenticated PATIENT role, queries every module, compares expected demo counts/totals, and probes read isolation without the application's patient filter. It prints counts and safe errors, not records or tokens. The probe cannot prove absence of every possible RLS weakness, especially if another patient's records do not exist in a table.

Run `supabase/setup/patient_dashboard_read_audit.sql` in the SQL editor to inspect existing columns, foreign keys, grants, enabled RLS, and all permissive/restrictive policies. Verify INSERT/UPDATE/DELETE policies require authorized staff; review clinical release restrictions. No broad patient write policies should be added.

Confirm the deployed migration's relationship/marker columns: admission `room_id` or `hospital_room_id`; booking `lab_test_id` or `test_id`; clinical-to-booking IDs (`lab_test_booking_id`, `lab_booking_id`, `booking_id`, or matching metadata); demo flags/reference prefixes; explicit payment completion status. Explicit booking links take priority. Without a link, a laboratory history entry and booking merge only when the normalized test name (including CBC aliases) and Manila date match unambiguously; distinct or ambiguous matches remain separate.

Finally, use a patient browser session to check all seven pages, mobile layouts, report/receipt access, reschedule and cancellation submissions, and cross-patient/write denial in an isolated test environment. Live browser verification and database policy changes have not been performed.
