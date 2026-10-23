# Doctor photo mapping status

The user-confirmed D8–D20 mapping is centralized in `lib/doctors/public-doctor-images.mjs`. All 13 files exist under `public/images/doctors/` with the requested case and extensions.

The directory and profile loaders continue to prefer each doctor's Supabase `image_url`. When that field is empty, they use this exact-name local mapping so the supplied portraits display immediately. The assigned-doctor query applies the same fallback, and appointment booking shows the selected doctor's photo.

## Supabase status

The live read confirmed all 13 specified UUID/name pairs and showed `image_url = null` for each. A guarded anon-key update matched zero rows for the first target, and a follow-up read confirmed no database change. No privileged Supabase credential or write tool is configured in this workspace.

`supabase/setup/doctor_demo_photo_assignments.sql` contains a safe D8–D20-only update. It verifies every UUID/name pair, refuses conflicting nonempty URLs, and updates only `image_url`. Doctors 1–7 are outside the script. Run it in the Supabase SQL editor using an authorized administrator session to persist the URLs.

The existing D1.jpg and D7.jpg files are byte-identical. Their existing Supabase assignments were left untouched.
