import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { RoomManagement } from "@/components/admin/RoomManagement";
import "./rooms.css";
export const metadata:Metadata={title:"Room Management"};
export default function AdminRoomsPage(){return <AdminShell title="Room Management" adminOnly><RoomManagement/></AdminShell>;}
