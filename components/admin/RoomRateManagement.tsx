"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { roomRateLabel } from "@/lib/rooms/room-rates";

type RoomCategoryRow = {
  id: string;
  name: string;
  slug: string;
  daily_rate: number | null;
  is_demo_rate: boolean;
  is_active: boolean;
};
type RoomCategoryValues = { rate: string };

const categoryColumns = "id,name,slug,daily_rate,is_demo_rate,is_active";
const errorMessage = (error: { code?: string; message?: string; details?: string; hint?: string }) =>
  `${error.code ? `(${error.code}) ` : ""}${error.message || "Unknown database error"}${error.details ? ` ${error.details}` : ""}${error.hint ? ` Hint: ${error.hint}` : ""}`;
const valuesFromRow = (row: RoomCategoryRow): RoomCategoryValues => ({
  rate: row.daily_rate == null ? "" : String(row.daily_rate),
});

export function RoomRateManagement() {
  const [rows, setRows] = useState<RoomCategoryRow[]>([]);
  const [values, setValues] = useState<Record<string, RoomCategoryValues>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      if (sessionError) console.error("[RoomRateManagement] Could not verify administrator session", {
        operation: "auth.getSession",
        name: sessionError.name,
        message: sessionError.message,
        status: sessionError.status,
      });
      setRows([]);
      setError(sessionError?.message || "Your administrator session is unavailable. Sign in again and retry.");
      setLoading(false);
      return;
    }
    const { data, error: loadError } = await supabase.from("room_categories")
      .select(categoryColumns)
      .order("daily_rate", { ascending: false });

    if (loadError) {
      console.error("[RoomRateManagement] Failed to load room categories", {
        operation: "room_categories.select(id,name,slug,daily_rate,is_demo_rate,is_active)",
        code: loadError.code,
        message: loadError.message,
        details: loadError.details,
        hint: loadError.hint,
      });
      setRows([]);
      setError(`Room categories could not be loaded: ${errorMessage(loadError)}`);
    } else {
      const nextRows = (data ?? []) as RoomCategoryRow[];
      setRows(nextRows);
      setValues(Object.fromEntries(nextRows.map((row) => [row.id, valuesFromRow(row)])));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveCategory = async (row: RoomCategoryRow, mode: "save" | "sample" | "official" | "unconfirmed" = "save") => {
    if (!supabase || savingId) return;
    const form = values[row.id] ?? valuesFromRow(row);
    const rawRate = mode === "unconfirmed" ? "" : form.rate.trim();
    const dailyRate = rawRate === "" ? null : Number(rawRate);
    if (dailyRate !== null && (!Number.isFinite(dailyRate) || dailyRate < 0)) {
      setError("Daily rates must be nonnegative numbers. Leave the field blank when a rate is unconfirmed.");
      return;
    }
    if (mode === "official" && dailyRate === null) {
      setError("Enter the approved daily rate before confirming it as official.");
      return;
    }

    setSavingId(row.id);
    setError("");
    setNotice("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (authError) console.error("[RoomRateManagement] Could not verify user before rate update", {
          operation: "auth.getUser",
          code: authError.code,
          message: authError.message,
          status: authError.status,
        });
        throw authError ?? new Error("Your administrator session has expired. Sign in again.");
      }
      console.info("[RoomRateManagement] Saving room category rate", {
        operation: "room_categories.update",
        userId: user.id,
        categoryId: row.id,
        dailyRate,
        mode,
      });

      const isDemoRate = mode === "sample" ? true
        : mode === "official" || mode === "unconfirmed" ? false
        : dailyRate === null ? false
        : row.daily_rate === null ? true
        : row.is_demo_rate;
      const { data, error: updateError } = await supabase.from("room_categories")
        .update({ daily_rate: mode === "unconfirmed" ? null : dailyRate, is_demo_rate: isDemoRate })
        .eq("id", row.id)
        .select("id,daily_rate")
        .single();

      if (updateError) {
        console.error("[RoomRateManagement] Failed to save room category rate", {
          operation: "room_categories.update(daily_rate,is_demo_rate)",
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        });
        throw new Error(errorMessage(updateError));
      }
      if (!data) throw new Error("The rate update returned no saved category row. The category may no longer exist or your account may not have permission to update it.");

      const { data: refreshedRows, error: refreshError } = await supabase.from("room_categories")
        .select(categoryColumns)
        .order("daily_rate", { ascending: false });
      if (refreshError) {
        console.error("[RoomRateManagement] Rate saved, but category refresh failed", {
          operation: "room_categories.select(after update)",
          code: refreshError.code,
          message: refreshError.message,
          details: refreshError.details,
          hint: refreshError.hint,
        });
        throw new Error(`Rate was saved, but the room list could not be refreshed: ${errorMessage(refreshError)}`);
      }

      const nextRows = (refreshedRows ?? []) as RoomCategoryRow[];
      setRows(nextRows);
      setValues(Object.fromEntries(nextRows.map((item) => [item.id, valuesFromRow(item)])));
      const rateStatus = data.daily_rate == null ? "marked unconfirmed"
        : mode === "sample" ? "saved as a sample rate"
        : mode === "official" ? "confirmed as an official rate"
        : "saved";
      setNotice(`${row.name} rate ${rateStatus} and verified after refresh.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Room rate could not be saved. Check the console for the Supabase error details.");
    } finally {
      setSavingId(null);
    }
  };

  return <>
    <div className="ad-page-header">
      <div><h1>Room Category Rates</h1><p>Review sample rates and enter approved daily room charges.</p></div>
      <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    {error ? <div className="ad-content-alert error" role="alert" style={{ marginTop: 14 }}>{error}</div> : null}
    {notice ? <div className="ad-content-alert success" role="status" style={{ marginTop: 14 }}>{notice}</div> : null}
    <section className="room-rate-admin-list" aria-label="Room category rates" aria-busy={loading}>
      {loading ? <p role="status">Loading room categories…</p> : error ? null : rows.length ? rows.map((row) => {
        const form = values[row.id] ?? valuesFromRow(row);
        const updateRate = (rate: string) => setValues((current) => ({ ...current, [row.id]: { rate } }));
        return <article className="room-rate-admin-row room-category-admin-card" key={row.id}>
          <div className="room-rate-admin-category">
            <h2>{row.name}</h2>
            <small>Current rate: {roomRateLabel(row.daily_rate)}</small>
            <small className={row.daily_rate == null ? "" : row.is_demo_rate ? "room-rate-admin-demo" : "room-rate-admin-official"}>
              {row.daily_rate == null ? "Rate unconfirmed" : row.is_demo_rate ? "DEMO / SAMPLE RATE" : "Official rate"}
            </small>
          </div>
          <div className="room-category-admin-fields">
            <label className="room-rate-admin-input">Daily rate (₱)<input type="number" min="0" step="0.01" inputMode="decimal" value={form.rate} onChange={(event) => updateRate(event.target.value)} placeholder="Rate to be confirmed" /></label>
          </div>
          <div className="room-rate-admin-actions">
            <button type="button" className="ad-btn ad-btn-ghost" disabled={savingId !== null} onClick={() => void saveCategory(row)}><Save size={14}/>{savingId === row.id ? "Saving…" : "Save changes"}</button>
            <button type="button" className="ad-btn ad-btn-primary" disabled={savingId !== null || !form.rate.trim()} onClick={() => void saveCategory(row, "sample")}>Save as sample</button>
            <button type="button" className="ad-btn ad-btn-primary" disabled={savingId !== null || !form.rate.trim()} onClick={() => void saveCategory(row, "official")}>Confirm as official</button>
            <button type="button" className="ad-btn ad-btn-ghost" disabled={savingId !== null || row.daily_rate == null} onClick={() => void saveCategory(row, "unconfirmed")}><Trash2 size={14}/>Mark unconfirmed</button>
          </div>
        </article>;
      }) : error ? null : <div className="ad-empty"><h2>No room categories found</h2><p>No active categories were returned.</p></div>}
    </section>
  </>;
}
