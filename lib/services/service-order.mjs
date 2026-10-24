// Presentation order only; names, descriptions, images, and IDs come from Supabase.
export const healthcareServiceSlugs = [
  "specialist-consultation", "preventive-healthcare", "diagnostics", "general-medicine",
  "emergency-care", "pediatrics", "pathology-lab", "neurology", "pharmacy", "cardiology",
];

/** @template {{slug: string}} T @param {T[]} services @returns {T[]} */
export function orderHealthcareServices(services) {
  const bySlug = new Map(services.map((service) => [service.slug, service]));
  return healthcareServiceSlugs.flatMap((slug) => bySlug.has(slug) ? [bySlug.get(slug)] : []);
}
