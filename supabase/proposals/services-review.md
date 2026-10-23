# Hospital service catalog review

No live records were inserted, edited or deleted. Reference screenshots were not attached in the accessible conversation. No screenshot descriptions or third-party photographs were copied.

## Existing confirmed records (10)

- Cardiology (cardiology)
- Diagnostics (diagnostics)
- Emergency Care (emergency-care)
- General Medicine (general-medicine)
- Neurology (neurology)
- Pathology Lab (pathology-lab)
- Pediatrics (pediatrics)
- Pharmacy (pharmacy)
- Preventive Healthcare (preventive-healthcare)
- Specialist Consultation (specialist-consultation)

## Exact match in proposed catalog

- Pediatrics

## Proposed missing services (39)

- Hematology ? Oncology Unit
- Home Health Services
- Internal Medicine
- Isolation Facilities
- Laboratory Services
- Maternal and Child Care
- Multidisciplinary Center for Diabetes, Thyroid, and Related Disorders
- Neurophysiology Unit
- Nursing Services
- Obstetrics and Gynecology
- Operating Room Complex
- Ophthalmology
- Orthopedics
- Pain Management Center
- Pharmacy Services 24/7
- Radiology Services
- Rehabilitation Medicine Unit
- Renal Unit
- Respiratory Care Unit
- Surgery
- Teen Clinic
- Wellness Center
- Women's Health Center
- Aesthetic Center
- Anesthesiology
- Cancer Center
- Cardiovascular Diagnostics and Cardiac Rehabilitation Unit
- Center for Sleep Disorders
- Clinical Nutrition Services
- Coronary Care Unit
- Critical Care Unit
- Emergency & Acute Care
- Emergency and Outpatient Services
- Endoscopy Unit
- Executive Health Unit
- Eye Institute
- Family Medicine
- Food & Nutrition Services
- Heart Institute

Similar wording is not confirmation: Pharmacy does not establish 24/7 hours, General Medicine does not establish Internal Medicine, and Emergency Care does not establish the two proposed emergency units. Have the administrator check semantic duplicates before approving the SQL. If an existing record is the same service under another name, remove that proposal rather than inserting a duplicate. Existing Pediatrics is retained with its current ID and content.

## Images and descriptions

All 10 existing services have Storage image URLs. No suitable department-specific local photographs exist in public/images/services; it contains medical-placeholder.svg. All 39 proposals need approved images and verified descriptions. Draft descriptions are deliberately empty and image_url is NULL. Admin upload and replacement remain available. Do not publish copied or unlicensed imagery.

## Approval and rollout

1. Administrator reviews names for actual hospital services and semantic duplicates.
2. Review proposed_hospital_services.sql outside the automatic migrations directory. It changes no schema and updates no existing records. Review current table defaults/constraints before running against a different database.
3. Explicitly uncomment the SET LOCAL approval line within the transaction to create only missing hidden drafts. Re-running skips existing names and slugs; conflicts never update records. The default script intentionally aborts without approval.
4. In Admin Services, supply verified short/full descriptions, authorized images and confirmed information. Activate each service only after the explicit hospital-verification confirmation. No bulk activation is included.
5. Public Services lists confirmed records dynamically; Clinical Departments stays restricted to its existing 10 slugs and requested order. The 40-service proposal is not a frontend catalog.

The proposed catalog plus the 9 other preserved existing services can yield 49 total listings after approval; it must not replace or delete those existing services to force a total of 40.

## Verification

- Read-only audit found the same 10 live services. All 10 existing image URLs returned HTTP 200.
- Production build and TypeScript passed.
- Render/search/link checks passed for 10 live records and a 49-record combined test fixture; no test records were inserted.
- Admin save payload tests confirmed both available=false and available=true persist in the request. Authenticated upload/activation was not exercised against live data.
- Hidden Chrome measurements of the rendered service component and current CSS at 1440/768/390px confirmed 4/2/1 columns, equal card heights, and no horizontal overflow.
- The review SQL was inspected but never executed; its approval gate, transaction, name/slug checks and conflict handling require administrator review before use.
- Screenshot comparison remains unavailable because the three reference screenshots were not attached.
