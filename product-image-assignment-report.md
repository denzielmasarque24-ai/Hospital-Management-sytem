# Product image assignment report

Date: 2026-10-23

## Results

- Supabase products inspected: 58
- Exact local image matches: 38
- Products without a matching image asset: 20
- SQL image mappings with missing local files: 0
- Product records changed from this workspace: 0 (the configured Supabase anon key has read-only access under current RLS)

The live `public.products` schema has an `image_url` column and no `image` column. All 58 current image URLs were null at inspection. A guarded single-row update was attempted for Absorbable Surgical Sutures, filtered by its UUID, exact name, and null image URL. It returned no updated row; readback confirmed the value remains null. No other row was modified.

The SQL script at `supabase/setup/product_image_assignments.sql` contains the 38 UUID/name/path matches. It checks every ID/name pair, aborts on conflicting existing image URLs, and updates only blank `image_url` fields. Run it from the Supabase SQL Editor using an authorized database role to apply the mappings.

The frontend resolves existing `image_url` first, then uses a centralized exact-name local fallback. The shared image component handles broken paths, and public catalog cards, product detail, and admin inventory/edit previews use that flow. The 20 unmatched products retain the unavailable-image fallback.

## Products without a matching asset

- Losartan 50mg Tablets
- Orthopedic Neck Pillow
- Paracetamol 500mg Tablets
- Pulse Oximeter
- PureVital Multivitamin
- Reusable Hot Water Bag
- Saline Nasal Spray 30ml
- Sterile Dressing Pack
- Sterile Gauze Pads
- Sterile Surgical Blades (Box of 100)
- Sterile Surgical Drapes
- Sterile Surgical Gloves
- Surgical Face Masks
- Surgical Instrument Tray
- Surgical Scalpel Handle No. 3
- Surgical Suction Tubing
- Vitamin B-Complex Tablets
- Vitamin C 500mg
- Vitamin D3 1000 IU
- Yankauer Suction Tip

## Validation

- Local assets: 38 files
- SQL mappings: 38
- Missing referenced files: 0
- `npx tsc --noEmit`: passed
- `npm run build`: compiled successfully and entered Next.js TypeScript phase; process output did not provide final completion status in this environment.
- `npm run lint`: could not run because the package script calls `next lint`, which this installed Next.js 16 CLI interprets as a project directory (`lint`).
