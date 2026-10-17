"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/lib/supabase/client";

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    siteName: "MediWell Pharma",
    siteEmail: "info@mediwell.com",
    phone: "+1 234 567 8900",
    address: "",
    operatingHours: "",
    currency: "PHP",
    lowStockThreshold: 20,
    emailNotifications: true,
    orderAlerts: true,
  });
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    if (!supabase) return;
    void supabase.from("website_content").select("content").eq("content_key", "settings").maybeSingle().then(({ data, error }) => {
      if (error) showToast(`Could not load settings: ${error.message}`);
      else if (data?.content) setSettings((current) => ({ ...current, ...(data.content as Partial<typeof current>) }));
    });
  }, []);

  const saveSettings = async () => {
    if (!supabase) { showToast("Supabase is not configured; settings are only changed for this session"); return; }
    const { error } = await supabase.from("website_content").upsert({ content_key: "settings", content: settings, updated_at: new Date().toISOString() });
    showToast(error ? `Could not save settings: ${error.message}` : "Settings saved");
  };

  return (
    <AdminShell title="Settings">
      <div className="ad-page-header">
        <div><h1>Settings</h1><p>Configure system preferences.</p></div>
      </div>

      <div className="ad-grid-2">
        <div className="ad-card">
          <div className="ad-card-header"><span className="ad-card-title">General Settings</span></div>
          <div className="ad-card-body">
            <div className="ad-form">
              <div className="ad-form-row"><label className="ad-label">Site Name</label><input className="ad-input" value={settings.siteName} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} /></div>
              <div className="ad-form-row"><label className="ad-label">Contact Email</label><input className="ad-input" type="email" value={settings.siteEmail} onChange={(e) => setSettings({ ...settings, siteEmail: e.target.value })} /></div>
              <div className="ad-form-row"><label className="ad-label">Phone</label><input className="ad-input" value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></div>
              <div className="ad-form-row"><label className="ad-label">Hospital Address</label><input className="ad-input" value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></div>
              <div className="ad-form-row"><label className="ad-label">Operating Hours</label><input className="ad-input" value={settings.operatingHours} onChange={(e) => setSettings({ ...settings, operatingHours: e.target.value })} /></div>
              <div className="ad-form-row">
                <label className="ad-label">Currency</label>
                <select className="ad-select" value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
                  <option value="PHP">PHP (₱)</option>
                </select>
              </div>
              <button type="button" className="ad-btn ad-btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => void saveSettings()}>Save Settings</button>
            </div>
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-card-header"><span className="ad-card-title">Inventory &amp; Notifications</span></div>
          <div className="ad-card-body">
            <div className="ad-form">
              <div className="ad-form-row">
                <label className="ad-label">Default Low Stock Threshold</label>
                <input className="ad-input" type="number" min="1" value={settings.lowStockThreshold} onChange={(e) => setSettings({ ...settings, lowStockThreshold: parseInt(e.target.value) || 0 })} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                {[
                  { key: "emailNotifications" as const, label: "Email notifications for new orders" },
                  { key: "orderAlerts" as const, label: "Low stock alerts" },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} />
                    <span style={{ fontSize: 13, color: "#374151" }}>{label}</span>
                  </label>
                ))}
              </div>
              <button type="button" className="ad-btn ad-btn-primary" style={{ alignSelf: "flex-start", marginTop: 8 }} onClick={() => void saveSettings()}>Save</button>
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="ad-toast-wrap"><div className="ad-toast ad-toast-success">✓ {toast}</div></div>}
    </AdminShell>
  );
}
