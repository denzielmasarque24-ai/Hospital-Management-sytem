import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { RoomRateManagement } from "@/components/admin/RoomRateManagement";

export const metadata: Metadata = { title: "Room Rates" };

export default function AdminRoomRatesPage() {
  return <AdminShell title="Room Rates" adminOnly><RoomRateManagement /></AdminShell>;
}
