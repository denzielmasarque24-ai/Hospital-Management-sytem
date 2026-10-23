"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { CreatePatientBill } from "@/components/admin/CreatePatientBill";
import { supabase } from "@/lib/supabase/client";
import "../admin.css";

type Payment = {
  id: string;
  patient_id: string;
  bill_id: string;
  bill_number: string;
  bill_status: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  checkout_session_id: string | null;
  provider_payment_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};
type PaymentCounts = { total: number; paid: number; pending: number; failed: number };
type PaymentSummary = Record<string, unknown>;
type SupabaseError = { code?: string; message?: string; details?: string; hint?: string; status?: number };
const emptyCounts: PaymentCounts = { total: 0, paid: 0, pending: 0, failed: 0 };

function isJsonObject(value: unknown): value is PaymentSummary {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summaryCount(summary: PaymentSummary | null, keys: string[], fallback: number) {
  if (!summary) return fallback;
  for (const key of keys) {
    const value = summary[key];
    const count = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    if (Number.isSafeInteger(count) && count >= 0) return count;
  }
  return fallback;
}

function describeError(error: SupabaseError) {
  return [error.code ? `(${error.code})` : "", error.message || "Database request failed.", error.details, error.hint ? `Hint: ${error.hint}` : ""]
    .filter(Boolean).join(" ");
}

function PaymentTable() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [counts, setCounts] = useState<PaymentCounts>(emptyCounts);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) {
      setRows([]);
      setCounts(emptyCounts);
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [summaryResult, listResult] = await Promise.all([
        supabase.rpc("payment_admin_summary"),
        supabase.from("online_payments")
          .select("id,patient_id,bill_id,bill_number:patient_bills!online_payments_bill_id_fkey!inner(bill_number,status,is_demo,payment_approved_at),amount,currency,payment_method,status,checkout_session_id,provider_payment_id,paid_at,created_at,updated_at", { count: "exact" })
          .eq("patient_bills.is_demo", false)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      const requests: Array<{ source: string; error: SupabaseError | null }> = [
        { source: "payment_admin_summary RPC", error: summaryResult.error },
        { source: "online_payments attempt list", error: listResult.error },
      ];
      let summaryValue: PaymentSummary | null = null;
      if (summaryResult.error?.code === "PGRST202") {
        console.warn("[AdminPayments] payment_admin_summary is missing from the PostgREST schema cache; falling back to the RLS-protected table query", {
          code: summaryResult.error.code,
          message: summaryResult.error.message,
          details: summaryResult.error.details,
          hint: summaryResult.error.hint,
          status: (summaryResult.error as typeof summaryResult.error & { status?: number }).status ?? null,
        });
      } else if (summaryResult.error) {
        console.error("[AdminPayments] Payment summary RPC failed", {
          code: summaryResult.error.code,
          message: summaryResult.error.message,
          details: summaryResult.error.details,
          hint: summaryResult.error.hint,
          status: (summaryResult.error as typeof summaryResult.error & { status?: number }).status ?? null,
        });
        throw new Error(describeError(summaryResult.error));
      } else if (!isJsonObject(summaryResult.data)) {
        console.error("[AdminPayments] Unexpected payment summary response shape", {
          responseType: Array.isArray(summaryResult.data) ? "array" : summaryResult.data === null ? "null" : typeof summaryResult.data,
          data: summaryResult.data,
        });
        throw new Error(`The payment summary RPC returned an unexpected ${Array.isArray(summaryResult.data) ? "array" : typeof summaryResult.data} response; expected a JSON object.`);
      } else {
        summaryValue = summaryResult.data;
        console.info("[AdminPayments] Payment summary RPC response", summaryValue);
      }

      const failure = requests.find((request) => request.error);
      if (failure?.error) {
        console.error("[AdminPayments] Payment list/count request failed", {
          source: failure.source,
          code: failure.error.code,
          message: failure.error.message,
          details: failure.error.details,
          hint: failure.error.hint,
          status: failure.error.status ?? null,
        });
        setRows([]);
        setCounts(emptyCounts);
        setError(describeError(failure.error));
        return;
      }

      if (!Array.isArray(listResult.data)) {
        console.error("[AdminPayments] Unexpected payment attempt list response shape", {
          responseType: listResult.data === null ? "null" : typeof listResult.data,
          data: listResult.data,
        });
        throw new Error("The online payment list returned an unexpected response; expected an array.");
      }
      const attempts = listResult.data.map((row) => {
        const joinedBill = row.bill_number as unknown as { bill_number?: string; status?: string } | { bill_number?: string; status?: string }[] | null;
        const billNumber = Array.isArray(joinedBill) ? joinedBill[0]?.bill_number : joinedBill?.bill_number;
        const billStatus = Array.isArray(joinedBill) ? joinedBill[0]?.status : joinedBill?.status;
        return { ...row, bill_number: billNumber ?? "—", bill_status: billStatus ?? "Unknown" } as Payment;
      });

      const nextCounts: PaymentCounts = {
        total: summaryCount(summaryValue, ["total_attempts", "total_payments", "total_count", "total"], listResult.count ?? 0),
        paid: summaryCount(summaryValue, ["paid_attempts"], 0),
        pending: summaryCount(summaryValue, ["pending_attempts"], 0),
        failed: summaryCount(summaryValue, ["failed_attempts"], 0),
      };
      console.info("[AdminPayments] Payment attempts and statistics loaded", { attemptRows: attempts.length, ...nextCounts });
      setRows(attempts);
      setCounts(nextCounts);
    } catch (cause) {
      const failure = cause as SupabaseError;
      console.error("[AdminPayments] Payment summary request threw", {
        code: failure?.code,
        message: failure?.message ?? String(cause),
        details: failure?.details,
        hint: failure?.hint,
        status: failure?.status ?? null,
      });
      setRows([]);
      setCounts(emptyCounts);
      setError(describeError(failure ?? {}));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const peso = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

  return <div className="mw-dashboard">
    <section className="ad-dashboard-welcome">
      <div className="ad-welcome-copy"><span className="ad-eyebrow">Finance</span><h1>Patient Payments &amp; Billing</h1><p>Create verified patient bills and review online payment attempts. Provider payments are marked paid only after a verified webhook.</p></div>
      <button type="button" className="ad-refresh-button" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
    </section>

    <CreatePatientBill />

    <section className="ad-dashboard-metrics mw-metrics" aria-label="Online payment statistics" aria-busy={loading}>
      {([
        ["Payment Attempts", counts.total],
        ["Paid", counts.paid],
        ["Pending", counts.pending],
        ["Failed", counts.failed],
      ] as const).map(([label, value]) => <article className="ad-metric-card" key={label}>
        <span className="ad-metric-copy"><span className="ad-metric-label">{label}</span><strong>{loading ? "…" : error ? "Unavailable" : value.toLocaleString()}</strong></span>
      </article>)}
    </section>

    {loading ? <section className="ad-card mw-panel"><p role="status">Loading payment attempts…</p></section>
      : error ? <section className="ad-card mw-panel"><p className="mw-errors" role="alert">Could not load payment attempts: {error}</p><button type="button" className="ad-refresh-button" onClick={() => void load()}>Retry</button></section>
      : rows.length === 0 ? <section className="ad-card mw-panel"><p>No real bill payment attempts yet.</p></section>
      : <section className="ad-card mw-panel"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Created</th><th>Bill</th><th>Bill status</th><th>Patient ID</th><th>Method</th><th>Amount</th><th>Status</th><th>Paid at</th><th>Provider reference</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{new Date(row.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</td><td>{row.bill_number}</td><td>{row.bill_status}</td><td><code>{row.patient_id}</code></td><td>{row.payment_method === "paymaya" ? "Maya" : row.payment_method === "card" ? "Card" : "GCash"}</td><td>{peso(Number(row.amount))}</td><td>{row.status}</td><td>{row.paid_at ? new Date(row.paid_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "—"}</td><td><code>{row.provider_payment_id || "—"}</code></td></tr>)}</tbody></table></div></section>}
  </div>;
}

export default function AdminPaymentsPage() {
  return <AdminShell title="Patient Payments" patientAccessOnly><PaymentTable /></AdminShell>;
}
