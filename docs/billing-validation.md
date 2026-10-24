# Patient billing validation

## Root cause

`CreatePatientBill.save` used one `lines.some(...)` expression for every description, quantity, price, reference, reason, and room check. Any incomplete row blocked the whole bill with the same long message. Service rows were created from a name-only service catalog with no approved price; additional rows started with empty price and reason fields. The client also rejected every room row unconditionally, and the latest billing RPC did the same. Correct room information alone could never make a room charge valid.

Server-side catalog checks already existed for products. Services, professional fees, and additional charges lacked equivalent price provenance: a submitted amount could pass numeric checks without an independently approved financial source. Removing the generic validation would therefore have weakened financial controls.

## Implemented behavior

- Per-row, per-field errors identify missing descriptions, invalid quantity/price precision, missing product/care/service references, missing supporting reasons, and missing approved room rates. Server errors include an item index and field in structured `DETAIL`, which the form associates with that row's stable key.
- Decimal text is validated before conversion or calculation. Quantities support up to three decimal places and prices up to two. Scientific notation, nonfinite values, negative values, excess precision, and zero quantities are rejected. No invalid quantity is silently rounded before saving. Inventory product quantities remain whole units because stock deductions use whole products; fractional quantities remain valid for approved non-inventory charges.
- Selected catalog products populate descriptions and catalog prices. Prices are read-only in the bill editor. Product existence, availability, stock, applicable catalog price, and any explicit demo flag are checked by the database on every save/finalization. Supporting details remain editable and are stored separately.
- Service/professional/room/additional charges require an immutable `patient_billing_authorizations` row. An authenticated hospital ADMIN or SUPER_ADMIN with billing access must explicitly approve the price, maximum quantity, patient, source references, service date, and documented billing basis. Billing staff can use approvals but cannot create or alter them. This is financial approval, not authority to create or approve clinical findings.
- Service approvals require an actual service and a genuine verified/released care record belonging to the patient. A service listing does not supply a price or prove delivery. Professional fees require the corresponding genuine verified care record and doctor, plus a financial fee approval; an admission's assigned doctor alone is insufficient.
- A room approval requires a genuine admission and genuine linked room, a manually verified rate and documented basis, and approved inclusive stay dates within the admission's Manila dates. Approved quantity must equal the approved number of days. Historical room metadata and configured/demo rates never automatically create a charge. Overlapping charges for the same admission are rejected.
- Additional charges require the authorized category, positive quantity, approved unit price, description, and supporting reason. The editor fills approved values from the financial source rather than accepting an arbitrary browser price.
- Approvals are single-use across charges. Professional fees also reject another charge for the same consultation, even if a second approval exists. Saving a genuine draft replaces its own items transactionally; approvals already used by that draft remain available to it.
- Existing BigInt preview calculations and PostgreSQL numeric total calculations remain intact. The atomic RPC validates, saves, deducts stock only on finalization, records inventory adjustments, and creates an idempotency receipt in one transaction. SHA-256 hashes bind a request reference to its exact patient and payload. Exact retries return the original result; changed payloads under an already committed reference are rejected. A synchronous UI guard also prevents double-click submissions.

## Migration and deployment

Apply `supabase/migrations/20261218000000_verified_billing_charges.sql` using the project's reviewed migration process. It adds:

- `patient_billing_authorizations`, with staff-only SELECT RLS and no direct client writes.
- A nullable `patient_medical_charges.billing_authorization_id` FK and a unique index for newly authorized charges.
- `patient_billing_save_requests`, with RLS and no direct client access.
- Explicitly authorized approval/options RPCs and a replacement of the canonical atomic billing RPC. Existing compatibility overloads continue to call the secured canonical function. PUBLIC and anonymous execution are revoked.

The migration does not update, delete, re-price, or auto-approve existing bill/charge rows. Existing finalized records remain unchanged. Legacy non-product drafts with no approved source must be explicitly financially verified and linked to a new approval before they can be finalized under the new controls. Product drafts continue to use catalog verification.

The migration was executed only against local test PostgreSQL. It has **not** been applied to live Supabase. No live bills, approvals, inventory, or patient records were created or modified by this task. Authenticated hosted-browser verification must follow deployment.

## Using the form

1. Select the correct patient.
2. Add a product from Medical Products & Supplies, or use a suitable existing approved financial source.
3. If a non-product source is missing, an authorized financial administrator opens **Verified Charge Authorizations → Approve a verified non-product charge**, selects the care/service/admission evidence, enters the independently verified price and quantity, and documents the basis. This never auto-fills a room rate from assignment/demo history.
4. Click **Add Approved Charge**, or select that authorization on the corresponding editable row. The Professional Fees list also shows available approved fees for each consultation.
5. Enter any supporting details and save a draft or finalize. Correct the specific highlighted field if validation fails. Change a unit price by obtaining/selecting a different verified authorization, rather than editing an unverified browser amount.

## Files changed in this task

Modified:

- `components/admin/CreatePatientBill.tsx`
- `app/(app)/admin/payments/billing.css`
- `tests/billing-patient-selection.test.mjs`
- `tests/billing-save-patient-bill.test.mjs`

Created:

- `components/admin/BillingAuthorizations.tsx`
- `lib/admin/billing-validation.mjs`
- `supabase/migrations/20261218000000_verified_billing_charges.sql`
- `tests/billing-validation.test.mjs`
- `tests/billing-database.test.mjs`
- `docs/billing-validation.md`

## Verification

The targeted billing/patient suite passes 44 tests, including:

- All five valid charge categories saved together, then finalized with the expected exact total.
- Valid fractional quantity on an approved additional charge.
- Invalid/zero/negative/excess-precision quantities, invalid prices, catalog price tampering, missing descriptions and required references, and missing reasons rejected with the correct item/field.
- Wrong-patient authorizations, demo care/admissions, unreleased care, duplicate professional fees, overlapping room stays, and approval reuse rejected.
- Draft/finalization retries do not duplicate bills, charges, inventory adjustments, or stock deductions. A failure after an inventory item rolls back the inventory change.
- Patient sessions cannot read financial authorizations, modify approved prices, or access internal save receipts.
- The actual React component retains editable row values, maps errors to stable rows, and prevents simultaneous saves.
- Existing patient billing calculations and historical demo display tests remain green.

Local SQL tests use the optional in-memory PostgreSQL engine installed for the earlier clinical tests:

```powershell
npm.cmd install --prefix .tmp/clinical-db --no-package-lock --no-save @electric-sql/pglite
node --test tests/billing-validation.test.mjs tests/billing-database.test.mjs tests/billing-patient-selection.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm.cmd run build
```

The database test explicitly skips if that optional engine is absent. The existing `npm.cmd run lint` remains blocked because the package script invokes removed `next lint`; ESLint tooling is also absent. That unrelated setup was not changed.

Type-check and production build pass. The full suite ran 115 tests: 110 passed, and the same five unrelated doctor-management/directory tests failed in `tests/admin-doctors.test.mjs` and `tests/doctor-directory.test.mjs`. No live Supabase or authenticated browser transactions were performed.
