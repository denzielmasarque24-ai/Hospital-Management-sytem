const ROLE_HOME_PATHS = {
  ADMIN: "/admin",
  SUPER_ADMIN: "/admin",
  INVENTORY_MANAGER: "/admin",
  SALES_STAFF: "/admin",
  DOCTOR: "/admin/medical-records",
  PHYSICIAN: "/admin/medical-records",
  CLINICIAN: "/admin/medical-records",
  CLINICAL_STAFF: "/admin/medical-records",
  NURSE: "/admin/medical-records",
  RECEPTIONIST: "/reception",
  PHARMACIST: "/pharmacy-portal",
  LAB_TECH: "/admin/laboratory-results",
  LAB_TECHNICIAN: "/admin/laboratory-results",
  LABORATORY_TECHNICIAN: "/admin/laboratory-results",
  PATHOLOGIST: "/admin/laboratory-results",
  LAB_SUPERVISOR: "/admin/laboratory-results",
  CASHIER: "/billing",
  PATIENT: "/",
};

export function getRoleHomeForValue(value) {
  const role = String(value ?? "").trim().toUpperCase();
  return ROLE_HOME_PATHS[role] ?? null;
}
