import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";

export default function MessagesPage() {
  return (
    <AdminShell title="Messages">
      <div className="ad-page-header">
        <div><h1>Messages &amp; Inquiries</h1><p>Patient and customer messages.</p></div>
      </div>

      <div className="ad-card">
        <div className="ad-card-body" style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Messaging System</h3>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
            The messaging system is powered by Supabase. Staff members can view and reply to patient conversations from the dedicated Message page.
          </p>
          <Link href="/contact" className="ad-btn ad-btn-primary" style={{ display: "inline-flex" }}>
            Open Message Center
          </Link>
        </div>
      </div>
    </AdminShell>
  );
}
