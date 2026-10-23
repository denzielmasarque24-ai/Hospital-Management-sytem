import { AdminShell } from "@/components/admin/AdminShell";
import AdminNotificationCenter from "@/components/admin/AdminNotificationCenter";

export default function NotificationsPage() {
  return <AdminShell title="Notifications" adminOnly><div className="ad-page-header"><div><h1>Notifications</h1><p>Review recent patient and hospital activity.</p></div></div><AdminNotificationCenter /></AdminShell>;
}
