export const SERVICE_PLACEHOLDER = "/images/services/medical-placeholder.svg";

// Slugs verified against public.services. Keep the existing asset filenames intact.
/** @type {Record<string, string>} */
export const serviceImages = {
  "aesthetic-center": "/images/services/Serene Facial Treatment in a Modern Spa.png",
  "anesthesiology": "/images/services/Anesthesia Care in the Operating Room.png",
  "cancer-center": "/images/services/Compassionate Infusion Care.png",
  "cardiovascular-diagnostics-cardiac-rehabilitation": "/images/services/Cardiac Stress Test in the Clinic.png",
  "center-for-sleep-disorders": "/images/services/Peaceful Sleep Study Monitoring.png",
  "clinical-nutrition-services": "/images/services/Balanced Nutrition Consultation.png",
  "coronary-care-unit": "/images/services/Focused Cardiac Care in the ICU.png",
  "critical-care-units": "/images/services/Focused Cardiac Care in the ICU.png",
  "emergency-acute-care": "/images/services/Emergency Room Resuscitation Team.png",
  "emergency-outpatient-services": "/images/services/Emergency Room Resuscitation Team.png",
  "endoscopy-unit": "/images/services/Endoscopy Procedure in a Modern Hospital.png",
  "executive-health-unit": "/images/services/Comprehensive Health Consultation Dashboard.png",
  "eye-institute": "/services/Precision Eye Examination in a Modern Clinic.png",
  "family-medicine": "/images/services/Warm Family Medicine Consultation.png",
  "food-nutrition-services": "/images/services/Healthy Plate Nutrition Consultation.png",
  "heart-institute": "/images/services/Heart Institute Consultation.png",
};

/**
 * Ordered fallbacks preserve admin uploads without changing database records.
 * @param {string} slug
 * @param {string | null | undefined} imageUrl
 * @returns {string[]}
 */
export function getServiceImageSources(slug, imageUrl) {
  const value = typeof imageUrl === "string" ? imageUrl.trim() : "";
  let uploaded = "";
  if (value && !value.split(/[?#]/)[0].endsWith("/medical-placeholder.svg")) {
    if (value.startsWith("/") && !value.startsWith("//")) uploaded = value;
    else {
      try {
        const url = new URL(value);
        if (["https:", "http:"].includes(url.protocol)) uploaded = url.href;
      } catch { /* Invalid URLs fall through to the local asset. */ }
    }
  }
  const local = Object.hasOwn(serviceImages, slug) ? serviceImages[slug] : "";
  return [...new Set([uploaded, local, SERVICE_PLACEHOLDER].filter(Boolean))];
}
