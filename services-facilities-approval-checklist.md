# Clinical Departments and Services & Facilities

The current database snapshot supplied for this work contains 26 records in `public.services`:

- 10 records with `section = 'clinical_departments'`
- 16 records with `section = 'services_facilities'`

No seed or data migration is needed. Existing rows, IDs, slugs, section values, descriptions, and Storage image URLs must remain unchanged.

## Application behavior

- The Clinical Departments page queries only `clinical_departments`.
- The Services & Facilities page queries only `services_facilities`.
- Search is case-insensitive and matches service names within the page's section.
- Service detail, related-service links, and the back link retain the record's section.
- Admin Services can search/filter by section and save the section when an authorized administrator creates or edits a record.
- New public records require an administrator confirmation and an uploaded image. The existing `service-images` bucket and its RLS policies remain in use.

## Review status

The verified service column list contains no persistent draft or publication-status column. Admin Services therefore requires an authenticated administrator to confirm that a new listing, description, section, and image have been reviewed before inserting it.

## Optional persistent review queue (not applied)

If the hospital needs drafts to wait for a separate approver, add a publication-status field in a separately reviewed migration, update public `SELECT` RLS to return only approved services, and add Admin actions for **Save Draft**, **Submit for Review**, and **Approve & Publish**. Existing records must not be bulk-marked approved; an administrator should review each row before changing its status. No such migration was applied because the verified schema has no status field and the existing records must remain unchanged.

No migration is needed for the page split: `section` already exists. Do not run the older proposed service-seed SQL against this database; it has been replaced by a read-only count query.
