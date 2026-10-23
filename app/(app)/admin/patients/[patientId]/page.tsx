import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PatientManager } from "@/components/admin/PatientManager";

export default async function ManagePatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)) notFound();
  return <AdminShell title="Manage Patient" patientAccessOnly><PatientManager patientId={patientId} /></AdminShell>;
}
