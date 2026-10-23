/**
 * Keep a defensive section boundary around rows returned by the already scoped
 * Supabase directory query.
 * @template {string} Section
 * @param {Array<{ section: Section }>} rows
 * @param {Section} section
 * @returns {Array<{ section: Section }>}
 */
export function filterServicesBySection(rows, section) {
  return rows.filter((row) => row.section === section);
}
