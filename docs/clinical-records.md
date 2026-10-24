# Medical records and laboratory result delivery

## Files in this implementation

Created:

- `app/(app)/admin/medical-records/page.tsx`
- `app/(app)/admin/laboratory-results/page.tsx`
- `app/(patient)/patient/laboratory-results/page.tsx`
- `app/api/clinical/route.ts`
- `app/api/clinical/documents/route.ts`
- `app/api/clinical/documents/[id]/route.ts`
- `components/admin/ClinicalRecordManager.tsx`
- `components/admin/clinical-records.css`
- `lib/clinical/server.ts`
- `lib/clinical/validation.mjs`
- `supabase/migrations/20261217000000_clinical_record_delivery.sql`
- `tests/clinical-records.test.mjs`
- `tests/clinical-database.test.mjs`
- `tests/clinical-ui.test.mjs`
- `docs/clinical-records.md`

Modified (preserving pre-existing workspace edits):

- `.gitignore` — ignore only the optional local PostgreSQL test engine directory.
- `components/admin/AdminSidebar.tsx` — clinical links and icons.
- `components/admin/AdminShell.tsx` — include the access mode in authentication effect dependencies.
- `components/admin/PatientStaffPermissions.tsx` — clarify review/release permission labels.
- `components/layout/Header.tsx` — patient lab link and permission-aware clinical staff links.
- `components/patient/PatientHome.tsx` — links in clinical release notifications.
- `components/patient/PatientMedicalHistory.tsx` — authorized document access links.
- `components/patient/PatientSectionContent.tsx` — pass attachment metadata to history.
- `lib/patient/dashboard.mjs` — released-record filtering and attachment association.
- `lib/patient/queries.mjs` — workflow fields, attachment metadata, notification links.
- `lib/supabase/role-home.mjs` — working clinical and laboratory role destinations.
- `proxy.ts` — permit staff with explicit clinical grants into the new routes.
- `tests/admin-sidebar.test.mjs` — assert retained navigation and both new modules.
- `tests/patient-dashboard.test.mjs` — assert the expanded released-record projection.

## Deployment

1. Apply `supabase/migrations/20261217000000_clinical_record_delivery.sql` to the existing Supabase project using the normal reviewed migration process. This task does not apply migrations to the live database. It requires the existing verified `profiles`, `doctors`, `patient_medical_records`, `lab_tests`, `lab_test_bookings`, `patient_notifications`, and patient-area permission helpers. The migration is transactional; incompatible existing schemas cause rollback rather than a destructive rebuild.
2. Configure `SUPABASE_SERVICE_ROLE_KEY` in the **server environment only**, alongside the existing public Supabase URL and anonymous key. Never prefix this secret with `NEXT_PUBLIC_`. The key is used only for server-validated private uploads and cleanup of definitely unattached objects. Database reads, drafts, review, release, and download authorization use the signed-in user's client and permissions. A missing key blocks uploads with a configuration error; it does not make storage public.
3. In **Admin → Patient Staff Access**, a super administrator grants the existing `clinical_author`, `clinical_release`, `lab_author`, and `lab_release` permissions to eligible verified staff accounts. No grants are assigned automatically. Existing hospital policy excludes general admins from self-authorizing clinical approval. Release permissions also authorize clinical review. A hospital must decide which eligible staff may receive those grants.
4. Sign in as an authorized author/reviewer to `/admin/medical-records` or `/admin/laboratory-results`. Clinical and laboratory staff role destinations now point to these working pages. A reviewer without author rights can review/release but cannot change findings or upload attachments.
5. Verify with two separate patient accounts, an author, a reviewer, and an unprivileged admin before enabling production use.

## Workflow

- Choose a registered patient by their profile UUID. The patient identity of an existing record is immutable.
- Save a draft before attaching documents. New forms keep a single client UUID across saves; a repeated create cannot insert a second copy. Concurrent updates use `updated_at` as an optimistic lock.
- Upload PDF, JPG/JPEG, or PNG, up to 10 MB. The route checks size, MIME, extension, and file signatures. The bucket also enforces size and MIME restrictions. Original names are display metadata only; object paths contain server-generated UUIDs.
- Review the findings, patient, assigned doctor, and documents, then explicitly mark reviewed. Review captures the authorized reviewer account and timestamp. The assigned doctor identifies the attending/reviewing physician and is distinct from the authenticated staff reviewer.
- Release only a reviewed record. The release, audit event, and generic patient notification commit together. Released records are locked; corrections require a follow-up record. An unreleased reviewed record can return to draft, clearing review evidence before changes.
- The patient sees released real records in My Medical History and My Laboratory Results. Bookings remain distinct from results. Booking completion does not imply a verified result. Multiple reports per test booking are allowed for distinct clinical results; a transport retry of the same result ID cannot duplicate a record.

## Schema and preservation

The migration adds workflow/reviewer/release fields to `patient_medical_records`, creates `patient_lab_results` linked to the verified booking/test tables, and creates `patient_clinical_documents` and `patient_clinical_events`. It adds `href` to existing patient notifications. Documents use a separate attachment table to support multiple files rather than a single public URL.

Legacy `patient_lab_orders` and its storage bucket are left untouched. They use an older order-based model and are not copied into the new booking-based results table. Existing medical rows retain `delivery_state = legacy`; content and demo flags are never backfilled or reclassified as real. Explicitly released legacy records remain visible to their owner. Legacy demo records marked recorded/verified/released/amended remain labeled demo history. Unreleased real legacy findings are not patient-visible. Clinical staff can review existing genuine legacy records; legacy content must be preserved and new findings entered as a follow-up.

## Authorization and storage policies

- Medical rows have both a permissive read policy and a restrictive gate, so older permissive policies cannot expose drafts to patients. Explicit clinical authors/reviewers can access their clinical module. Existing billing permissions retain read access to released or previously verified legacy clinical records for professional-fee reconciliation, but confer no attachment access or clinical editing rights.
- Lab rows are readable only by authorized lab personnel or the owner after reviewed release. Direct authenticated writes to clinical records, results, attachment metadata, and audit events are revoked. Definer RPCs have a fixed empty search path, explicit permission checks, patient ownership checks, and bounded inputs.
- The `patient-medical-documents` bucket is private. RLS restricts reads to linked attachment metadata visible to the caller. Restrictive insert/update/delete policies prevent authenticated clients from bypassing the server upload path. No user can overwrite an approved file through storage APIs.
- Viewing/downloading `/api/clinical/documents/{id}` rechecks authenticated ownership and release state, records an access event, and returns a 60-second signed URL with no-store headers. Paths supplied by a caller are never signed. Authorized personnel can inspect drafts; patients cannot.
- Staff may inspect metadata-only history events. Events record actor IDs and actions without duplicating clinical descriptions in application logs or notification previews.
- If upload-to-metadata registration fails, cleanup deletes only an object confirmed unattached. An uncertain transport failure leaves the private object inaccessible rather than deleting a possibly committed attachment. Operational cleanup of such orphans must verify they are unreferenced.

## Validation

Run the ordinary regression tests with `node --test tests/*.test.mjs`, type-check with `node node_modules/typescript/bin/tsc --noEmit --incremental false`, and build with `npm.cmd run build` on Windows. The repository's existing `npm run lint` invokes removed `next lint`; ESLint and eslint-config-next are not installed, so lint requires a separate repository tooling repair.

For an isolated real PostgreSQL/RLS test (no live database access):

```powershell
npm.cmd install --prefix .tmp/clinical-db --no-package-lock --no-save @electric-sql/pglite
node --test tests/clinical-database.test.mjs tests/clinical-records.test.mjs
```

The database test bootstraps verified table shapes, authentication identities, and permission helpers in an in-memory PostgreSQL engine, applies the actual migration, then exercises permission failures, patient isolation, drafts/review/release, wrong-patient bookings, document authorization, storage write denial, immutable reviewed findings, notifications, stale updates, and legacy preservation. It skips explicitly if that optional local engine is unavailable. This is not a substitute for testing actual Supabase Auth, hosted Storage uploads/signed URLs, and the deployed schema with authorized staging accounts.

Production smoke test: author creates and uploads a draft for patient A; patient A and B cannot access it; a reviewer reviews and releases it; A gets a generic linked notification and can view/download; B remains denied even with the document UUID. Repeat for lab results, then confirm real billing and historical demo records remain intact. Verify both mobile navigation and switching patients while requests are pending. No live patient records are needed for local automated tests.

## Results from this workspace

- 47 targeted clinical, sidebar, patient-dashboard, and billing tests passed, including the actual migration executed in local PostgreSQL and role-based RLS checks.
- The full suite ran 110 tests: 105 passed and 5 failed in the existing doctor-management/directory suites (`tests/admin-doctors.test.mjs` and `tests/doctor-directory.test.mjs`). Those failures concern outdated query mocks, doctor error-display expectations, avatar sizing, and a missing mock import; those modules were not changed by this implementation.
- Type-check passed. Production build passed with all new routes present.
- `npm.cmd run lint` remains blocked by the repository's removed `next lint` command and missing ESLint packages.
- Live database migration, actual Supabase Storage transfers/signed URLs, and authenticated browser smoke tests were not performed. No live patient data was created or modified.
