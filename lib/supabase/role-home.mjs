const ROLE_HOME_PATHS = {
  ADMIN: "/admin",
  SUPER_ADMIN: "/admin",
  INVENTORY_MANAGER: "/admin",
  SALES_STAFF: "/admin",
  DOCTOR: "/doctor",
  NURSE: "/nurse",
  RECEPTIONIST: "/reception",
  PHARMACIST: "/pharmacy-portal",
  LAB_TECHNICIAN: "/lab",
  CASHIER: "/billing",
  PATIENT: "/",
};

export function getRoleHomeForValue(value) {
  const role = String(value ?? "").trim().toUpperCase();
  return ROLE_HOME_PATHS[role] ?? null;
}
