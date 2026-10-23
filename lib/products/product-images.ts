const PRODUCT_IMAGE_PATHS: Readonly<Record<string, string>> = {
  "Absorbable Surgical Sutures": "/images/products/absorbable-surgical-sutures.png",
  "Adson Tissue Forceps": "/images/products/adson-tissue-forceps.png",
  "Alcohol 70% 500ml": "/images/products/alcohol-70-500ml.png",
  "Amlodipine 5mg Tablets": "/images/products/amlodipine-5mg-tablets.png",
  "Amoxicillin 500mg Capsules": "/images/products/amoxicillin-500mg-capsules.png",
  "ApexRelief Plus": "/images/products/apexrelief-plus.png",
  "Atorvastatin 20mg Tablets": "/images/products/atorvastatin-20mg-tablets.png",
  "Antacid Chewable Tablets": "/images/products/antacid-chewable-tablets.png",
  "Antibacterial Hand Wash 250ml": "/images/products/antibacterial-hand-wash-250ml.png",
  "Army-Navy Retractor": "/images/products/army-navy-retractor.png",
  "Blood Glucose Meter": "/images/products/blood-glucose-meter.png",
  "Calcium + Vitamin D Tablets": "/images/products/calcium-vitamin-d-tablets.png",
  "CalmCare Syrup": "/images/products/calmcare-syrup.png",
  "CareSense Monitor": "/images/products/caresense-monitor.png",
  "Cetirizine 10mg Tablets": "/images/products/cetirizine-10mg-tablets.png",
  "Daily Balance Gummies": "/images/products/daily-balance-gummies.png",
  "Digital Blood Pressure Monitor": "/images/products/digital-blood-pressure-monitor.png",
  "Digital Thermometer": "/images/products/digital-thermometer.png",
  "Digital Weighing Scale": "/images/products/digital-weighing-scale.png",
  "Disposable Face Masks (50 pcs)": "/images/products/disposable-face-masks-50-pcs.png",
  "Disposable Surgical Gown": "/images/products/disposable-surgical-gown.png",
  "Elastic Support Bandage": "/images/products/elastic-support-bandage.png",
  "Electrosurgical Pencil": "/images/products/electrosurgical-pencil.png",
  "FlexGuard Support": "/images/products/flexguard-support.png",
  "Gentle Body Wash 250ml": "/images/products/gentle-body-wash-250ml.png",
  "GentleCare Hand Wash": "/images/products/gentlecare-hand-wash.png",
  "Hand Sanitizer 100ml": "/images/products/hand-sanitizer-100ml.png",
  "HeartCare Capsules": "/images/products/heartcare-capsules.png",
  "Hot & Cold Gel Pack": "/images/products/hot-cold-gel-pack.png",
  "Kelly Hemostatic Forceps": "/images/products/kelly-hemostatic-forceps.png",
  "Mayo Surgical Scissors": "/images/products/mayo-surgical-scissors.png",
  "Mayo-Hegar Needle Holder": "/images/products/mayo-hegar-needle-holder.png",
  "Metformin 500mg Tablets": "/images/products/metformin-500mg-tablets.png",
  "Metzenbaum Dissecting Scissors": "/images/products/metzenbaum-dissecting-scissors.png",
  "Mosquito Hemostatic Forceps": "/images/products/mosquito-hemostatic-forceps.png",
  "Multivitamins Capsules": "/images/products/multivitamins-capsules.png",
  "Nebulizer Machine": "/images/products/nebulizer-machine.png",
  "Oral Rehydration Salts Sachet": "/images/products/oral-rehydration-salts-sachet.png",
};

export function getProductImagePath(name: string | null | undefined): string | null {
  const exactName = typeof name === "string" ? name.trim() : "";
  return PRODUCT_IMAGE_PATHS[exactName] ?? null;
}

export const MATCHED_PRODUCT_IMAGE_COUNT = Object.keys(PRODUCT_IMAGE_PATHS).length;
