# Product image verification

Actual directory: `public/images/products/`. Browser URLs use `/images/products/`. All 57 files are valid PNGs, decoded successfully with Sharp, and returned HTTP 200 with bytes identical to the source files from the production server.

## Diagnosis and fix

The current filenames and mappings were already correct. Normal lazy-loading checks did not reproduce a missing mapped photograph; Paracetamol has no matching file. No claim is made that the original user incident was caused by the optimizer.

A controlled optimizer failure reproduced a real failure path: Sterile Surgical Gloves showed Image unavailable while the original PNG returned HTTP 200. The old component exhausted its source list immediately after an optimizer error. It also advanced its source index on every error event, allowing duplicate errors to skip the next candidate.

Updated `components/products/ProductImage.tsx`: retry the same local asset directly through Next Image with unoptimized enabled before advancing; ignore duplicate/delayed errors from previous attempts; keep candidate-list keys so changed product/image props reset state. Uploaded image priority and contain sizing remain unchanged. No mappings, image files, prices, stock, categories, or database records were changed in this fix.

## Missing image

Paracetamol 500mg Tablets (`paracetamol-500mg-tablets`): no matching image found in the workspace asset directories. It intentionally retains the generic placeholder.

## Validation

- Product mapping and fallback regression tests: 5 passed.
- TypeScript: passed.
- Production build: passed after allowing the configured Google Fonts download.
- Lint attempted: unavailable; package script invokes removed `next lint`, and ESLint dependencies are not installed. Unrelated lint configuration was not modified.
- Browser verification: 58 cards using normal lazy loading, 57 matching photos, 19 requested detail dialogs, 4/2/1 responsive columns, uploaded/local fallbacks, and unchanged database snapshot.
- Production fault injection: Sterile Surgical Drapes, Sterile Surgical Gloves, Surgical Face Masks, Vitamin C 500mg, Vitamin D3 1000 IU, and Yankauer Suction Tip all loaded their original PNGs in cards and details while every product optimizer request deliberately returned 503.

## Exact matched files

| Product | Database slug | Filename in public/images/products | Format / dimensions | HTTP |
|---|---|---|---|---|
| Absorbable Surgical Sutures | absorbable-surgical-sutures | absorbable-surgical-sutures.png | png 1536�1024 | 200 |
| Adson Tissue Forceps | adson-tissue-forceps | adson-tissue-forceps.png | png 1536�1024 | 200 |
| Alcohol 70% 500ml | alcohol-70-500ml | alcohol-70-500ml.png | png 1278�1230 | 200 |
| Amlodipine 5mg Tablets | amlodipine-5mg-tablets | amlodipine-5mg-tablets.png | png 1536�1024 | 200 |
| Amoxicillin 500mg Capsules | amoxicillin-500mg-capsules | amoxicillin-500mg-capsules.png | png 1536�1024 | 200 |
| Antacid Chewable Tablets | antacid-chewable-tablets | antacid-chewable-tablets.png | png 1536�1024 | 200 |
| Antibacterial Hand Wash 250ml | antibacterial-hand-wash-250ml | antibacterial-hand-wash-250ml.png | png 1278�1230 | 200 |
| ApexRelief Plus | apexrelief-plus | apexrelief-plus.png | png 1536�1024 | 200 |
| Army-Navy Retractor | army-navy-retractor | army-navy-retractor.png | png 1536�1024 | 200 |
| Atorvastatin 20mg Tablets | atorvastatin-20mg-tablets | atorvastatin-20mg-tablets.png | png 1536�1024 | 200 |
| Blood Glucose Meter | blood-glucose-meter | blood-glucose-meter.png | png 1536�1024 | 200 |
| Calcium + Vitamin D Tablets | calcium-vitamin-d-tablets | calcium-vitamin-d-tablets.png | png 1536�1024 | 200 |
| CalmCare Syrup | calmcare-syrup | calmcare-syrup.png | png 1536�1024 | 200 |
| CareSense Monitor | caresense-monitor | caresense-monitor.png | png 1536�1024 | 200 |
| Cetirizine 10mg Tablets | cetirizine-10mg-tablets | cetirizine-10mg-tablets.png | png 1536�1024 | 200 |
| Daily Balance Gummies | daily-balance-gummies | daily-balance-gummies.png | png 1536�1024 | 200 |
| Digital Blood Pressure Monitor | digital-blood-pressure-monitor | digital-blood-pressure-monitor.png | png 1536�1024 | 200 |
| Digital Thermometer | digital-thermometer | digital-thermometer.png | png 1536�1024 | 200 |
| Digital Weighing Scale | digital-weighing-scale | digital-weighing-scale.png | png 1536�1024 | 200 |
| Disposable Face Masks (50 pcs) | disposable-face-masks-50-pcs | disposable-face-masks-50-pcs.png | png 1536�1024 | 200 |
| Disposable Surgical Gown | disposable-surgical-gown | disposable-surgical-gown.png | png 1145�1374 | 200 |
| Elastic Support Bandage | elastic-support-bandage | elastic-support-bandage.png | png 1536�1024 | 200 |
| Electrosurgical Pencil | electrosurgical-pencil | electrosurgical-pencil.png | png 1536�1024 | 200 |
| FlexGuard Support | flexguard-support | flexguard-support.png | png 1536�1024 | 200 |
| Gentle Body Wash 250ml | gentle-body-wash-250ml | gentle-body-wash-250ml.png | png 1536�1024 | 200 |
| GentleCare Hand Wash | gentlecare-hand-wash | gentlecare-hand-wash.png | png 1536�1024 | 200 |
| Hand Sanitizer 100ml | hand-sanitizer-100ml | hand-sanitizer-100ml.png | png 1536�1024 | 200 |
| HeartCare Capsules | heartcare-capsules | heartcare-capsules.png | png 1536�1024 | 200 |
| Hot & Cold Gel Pack | hot-cold-gel-pack | hot-cold-gel-pack.png | png 1536�1024 | 200 |
| Kelly Hemostatic Forceps | kelly-hemostatic-forceps | kelly-hemostatic-forceps.png | png 1536�1024 | 200 |
| Losartan 50mg Tablets | losartan-50mg-tablets | Losartan Tablets Packaging Still Life.png | png 1536�1024 | 200 |
| Mayo Surgical Scissors | mayo-surgical-scissors | mayo-surgical-scissors.png | png 1536�1024 | 200 |
| Mayo-Hegar Needle Holder | mayo-hegar-needle-holder | mayo-hegar-needle-holder.png | png 1536�1024 | 200 |
| Metformin 500mg Tablets | metformin-500mg-tablets | metformin-500mg-tablets.png | png 1536�1024 | 200 |
| Metzenbaum Dissecting Scissors | metzenbaum-dissecting-scissors | metzenbaum-dissecting-scissors.png | png 1536�1024 | 200 |
| Mosquito Hemostatic Forceps | mosquito-hemostatic-forceps | mosquito-hemostatic-forceps.png | png 1536�1024 | 200 |
| Multivitamins Capsules | multivitamins-capsules | multivitamins-capsules.png | png 1536�1024 | 200 |
| Nebulizer Machine | nebulizer-machine | nebulizer-machine.png | png 1536�1024 | 200 |
| Oral Rehydration Salts Sachet | oral-rehydration-salts-sachet | oral-rehydration-salts-sachet.png | png 1536�1024 | 200 |
| Orthopedic Neck Pillow | orthopedic-neck-pillow | Ergonomic White and Gray Cervical Pillow.png | png 1536�1024 | 200 |
| Pulse Oximeter | pulse-oximeter | Blue-and-White Pulse Oximeter Display.png | png 1536�1024 | 200 |
| PureVital Multivitamin | purevital-multivitamin | PureVital Multivitamin Product Display.png | png 1536�1024 | 200 |
| Reusable Hot Water Bag | reusable-hot-water-bag | Blue Hot Water Bottle with Plush Gray Cover.png | png 1536�1024 | 200 |
| Saline Nasal Spray 30ml | saline-nasal-spray-30ml | Saline Nasal Spray Product Display.png | png 1536�1024 | 200 |
| Sterile Dressing Pack | sterile-dressing-pack | Sterile Dressing Pack Contents.png | png 1536�1024 | 200 |
| Sterile Gauze Pads | sterile-gauze-pads | Sterile Gauze Pads Product Display.png | png 1536�1024 | 200 |
| Sterile Surgical Blades (Box of 100) | sterile-surgical-blades-box-of-100 | Sterile Surgical Blades Product Display.png | png 1536�1024 | 200 |
| Sterile Surgical Drapes | sterile-surgical-drapes | Sterile Surgical Drapes Product Set.png | png 1536�1024 | 200 |
| Sterile Surgical Gloves | sterile-surgical-gloves | Sterile Surgical Gloves Studio Display.png | png 1536�1024 | 200 |
| Surgical Face Masks | surgical-face-masks | Surgical Face Masks Product Display.png | png 1536�1024 | 200 |
| Surgical Instrument Tray | surgical-instrument-tray | Sterile Stainless Steel Surgical Tray Kit.png | png 1536�1024 | 200 |
| Surgical Scalpel Handle No. 3 | surgical-scalpel-handle-no-3 | Surgical Scalpel Handle No. 3.png | png 1536�1024 | 200 |
| Surgical Suction Tubing | surgical-suction-tubing | Sterile Surgical Suction Tubing Set.png | png 1536�1024 | 200 |
| Vitamin B-Complex Tablets | vitamin-b-complex-tablets | Vitamin B-Complex Supplement Display.png | png 1536�1024 | 200 |
| Vitamin C 500mg | vitamin-c-500mg | Vitamin C Tablets Product Advertisement.png | png 1536�1024 | 200 |
| Vitamin D3 1000 IU | vitamin-d3-1000-iu | Vitamin D3 Supplement Product Shot.png | png 1536�1024 | 200 |
| Yankauer Suction Tip | yankauer-suction-tip | Yankauer Suction Tip Medical Packaging.png | png 1536�1024 | 200 |
