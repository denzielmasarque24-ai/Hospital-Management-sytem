import { AdminShell } from "@/components/admin/AdminShell";
import { PatientStaffPermissions } from "@/components/admin/PatientStaffPermissions";

export default function PatientStaffAccessPage() {
  return <AdminShell title="Patient Staff Access" adminOnly><PatientStaffPermissions /></AdminShell>;
}
