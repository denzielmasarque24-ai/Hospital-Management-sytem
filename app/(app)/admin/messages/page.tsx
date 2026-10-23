import { AdminShell } from "@/components/admin/AdminShell";
import AdminMessages from "@/components/admin/AdminMessages";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  const { conversation = "" } = await searchParams;
  return (
      <AdminShell title="Messages">
      <div className="admin-messages-page">
        <div className="ad-page-header">
          <div>
            <h1>Messages &amp; Inquiries</h1>
            <p>Review patient conversations and reply securely.</p>
          </div>
        </div>
        <AdminMessages initialConversationId={conversation} />
      </div>
    </AdminShell>
  );
}
