# Signup/profile alignment and rollout

## Code changes

Registration passes only these metadata keys to Supabase Auth: `first_name`, `middle_name`, `last_name`, `suffix`, `gender`, `date_of_birth` (YYYY-MM-DD), `mobile_number`, `username`, and boolean `terms_accepted`. Passwords are supplied only to Auth. Role, owner/admin status, email and combined names are not included in metadata. No registration component inserts or updates `public.profiles`; `on_auth_user_created -> public.handle_new_user()` owns profile creation.

The existing email confirmation, resend, OTP verification and role-based login destination are retained. The patient profile now reads the trigger-created identity fields and `terms_accepted_at`; it uses `birthday` only as a read fallback. Contact edits still use the existing separate `patient_portal_profiles` table, whose existing `full_name` column is unrelated to `public.profiles`.

## Live read-only checks

- Confirmed the expected identity columns including both `date_of_birth` and `birthday` using zero-row API requests.
- Confirmed `terms_accepted_at`, `email` and `phone` exist. `terms_accepted` is not a profile column; it is trigger metadata.
- The `is_username_available` RPC is not currently deployed. The form prefers that RPC and temporarily falls back to a username-only, escaped, case-insensitive lookup. Such a lookup is constrained by existing RLS and is not an atomic uniqueness guarantee. The database index is authoritative for concurrent signups.
- No database-admin connection or deployed `handle_new_user()` definition was available in the checkout. Actual trigger behavior, live UPDATE grants/policies and signup persistence cannot be certified from a public API key.

## Required administrator database step

1. Run `supabase/setup/signup_profile_audit.sql` in the Supabase SQL Editor. Inspect the actual trigger definition, column defaults, index definitions, UPDATE grants and all permissive/restrictive policies.
2. Confirm `handle_new_user()` uses the exact nine metadata keys, creates one profile with a server-controlled PATIENT role, stores consent only on explicit boolean acceptance, and handles birth date/mobile/username. It must not trust role or owner claims from user metadata. Do not overwrite the existing function without reviewing its definition.
3. Review and apply `supabase/migrations/20261110000000_registration_profile_safety.sql`. This adds a normalized unique username index, a boolean-only availability RPC, and an UPDATE guard. It neither removes existing RLS policies nor changes the Auth trigger. It aborts when normalized duplicate usernames exist instead of modifying accounts. Admin/Super Admin access is determined from stored roles; other authenticated accounts cannot alter protected fields even if a broad table-level UPDATE grant exists.
4. Review the historical `20261108000000_patient_registration_profile_access.sql` before replaying old migrations on this schema: it assumes legacy columns and client-created profiles. This repair migration is independent of that historical file.

The migration has been prepared, not applied. No user records, grants or RLS policies were changed live.

## Verification to complete with an approved test account

- Submit all personal fields, explicitly accept Terms and Privacy, and confirm email through the existing process. Verify exactly one `public.profiles` row for the Auth user ID.
- Compare the nine supplied metadata fields with the trigger-created row and consent timestamp, then check `/patient/profile`. Optional empty middle name/suffix may be stored as empty or NULL by the existing trigger.
- Retry a duplicate username, including a case variation, and concurrent requests. The unique index must reject duplicates, with no extra Auth/profile rows left behind.
- As a PATIENT session, attempt an UPDATE of its own `role`, `id`, email, consent timestamp and any other privileged columns; each must fail. Confirm permitted contact updates still work and staff updates follow existing RLS.
- Verify an email link or OTP confirmation followed by normal login still reaches the appropriate patient page. Do not use a real patient's email as a test address.

Automated tests cover exact metadata, explicit consent and field validation, duplicate/preflight behavior, email OTP continuation without client profile writes, and patient profile display. They do not replace the authenticated live signup or database permission tests above.
