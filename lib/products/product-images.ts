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
  "Losartan 50mg Tablets": "/images/products/Losartan Tablets Packaging Still Life.png",
  "Orthopedic Neck Pillow": "/images/products/Ergonomic White and Gray Cervical Pillow.png",
  "Pulse Oximeter": "/images/products/Blue-and-White Pulse Oximeter Display.png",
  "PureVital Multivitamin": "/images/products/PureVital Multivitamin Product Display.png",
  "Reusable Hot Water Bag": "/images/products/Blue Hot Water Bottle with Plush Gray Cover.png",
  "Saline Nasal Spray 30ml": "/images/products/Saline Nasal Spray Product Display.png",
  "Sterile Dressing Pack": "/images/products/Sterile Dressing Pack Contents.png",
  "Sterile Gauze Pads": "/images/products/Sterile Gauze Pads Product Display.png",
  "Sterile Surgical Blades (Box of 100)": "/images/products/Sterile Surgical Blades Product Display.png",
  "Sterile Surgical Drapes": "/images/products/Sterile Surgical Drapes Product Set.png",
  "Sterile Surgical Gloves": "/images/products/Sterile Surgical Gloves Studio Display.png",
  "Surgical Face Masks": "/images/products/Surgical Face Masks Product Display.png",
  "Surgical Instrument Tray": "/images/products/Sterile Stainless Steel Surgical Tray Kit.png",
  "Surgical Scalpel Handle No. 3": "/images/products/Surgical Scalpel Handle No. 3.png",
  "Surgical Suction Tubing": "/images/products/Sterile Surgical Suction Tubing Set.png",
  "Vitamin B-Complex Tablets": "/images/products/Vitamin B-Complex Supplement Display.png",
  "Vitamin C 500mg": "/images/products/Vitamin C Tablets Product Advertisement.png",
  "Vitamin D3 1000 IU": "/images/products/Vitamin D3 Supplement Product Shot.png",
  "Yankauer Suction Tip": "/images/products/Yankauer Suction Tip Medical Packaging.png",
};

function imageKey(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const productImageMap: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PRODUCT_IMAGE_PATHS).map(([name, src]) => [imageKey(name), src]),
);

export function getProductImagePath(name: string | null | undefined, slug?: string): string | null {
  const exactName = typeof name === "string" ? name.trim() : "";
  const key = slug || imageKey(exactName);
  return (Object.hasOwn(productImageMap, key) ? productImageMap[key] : null) ?? PRODUCT_IMAGE_PATHS[exactName] ?? null;
}

export function getProductImageSources(name: string, imageUrl?: string | null, slug?: string): string[] {
  const value = imageUrl?.trim() || "";
  let uploaded = "";
  if (value.startsWith("/") && !value.startsWith("//")) uploaded = value;
  else if (value) {
    try {
      const url = new URL(value);
      if (["https:", "http:", "blob:"].includes(url.protocol)) uploaded = url.href;
    } catch { /* Invalid URLs use the matching local image. */ }
  }
  return [...new Set([uploaded, getProductImagePath(name, slug)].filter((src): src is string => Boolean(src)))];
}

export const MATCHED_PRODUCT_IMAGE_COUNT = Object.keys(PRODUCT_IMAGE_PATHS).length;
