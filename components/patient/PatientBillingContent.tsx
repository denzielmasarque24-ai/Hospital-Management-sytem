import { ArrowUpRight, FileText, ShieldCheck } from "lucide-react";
import { formatPatientDate, isDemo, safeReceiptUrl, summarizeBills } from "@/lib/patient/dashboard.mjs";

type Row = Record<string, any>;
type BillingData = { bills?: Row[]; charges?: Row[]; payments?: Row[]; refunds?: Row[] };
type Invoice = Row & { items: Row[]; payments: Row[]; totalsKnown: boolean; total: number; paid: number; balance: number; chargeRows: Row[] };

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(value);
const invoice = (row?: Row) => row?.bill_number || "Invoice reference unavailable";
const amountOf = (row: Row) => Math.round(Number(row.quantity || 0) * Number(row.unit_price || 0) * 100) / 100;
const verifiedPaymentStatuses = new Set(["completed", "paid", "succeeded", "refunded"]);

function SummaryCards({ items }: { items: [string, string, string][] }) {
  const icons = [FileText, ShieldCheck, ArrowUpRight];
  return <div className="patient-billing-summary">
    {items.map(([label, value, tone], index) => {
      const Icon = icons[index];
      return <article className={`patient-card patient-billing-summary-card ${tone}`} key={label}>
        <span className="patient-billing-summary-icon"><Icon size={19} aria-hidden="true" /></span>
        <span className="patient-billing-summary-label">{label}</span>
        <strong>{value}</strong>
      </article>;
    })}
  </div>;
}

function ChargeTable({ charges }: { charges: Row[] }) {
  return <div className="patient-responsive-table"><table className="patient-table patient-billing-table">
    <caption className="patient-sr-only">Itemized hospital bill charges</caption>
    <thead><tr><th scope="col">Hospital service or charge</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Line total</th></tr></thead>
    <tbody>{charges.map((item) => <tr key={item.id}>
      <td>{item.item_name || item.description || item.category || "Hospital charge"}</td>
      <td>{item.quantity}</td>
      <td>{money(Number(item.unit_price || 0))}</td>
      <td>{money(Number(item.total_amount ?? item.line_total ?? amountOf(item)))}</td>
    </tr>)}</tbody>
  </table></div>;
}

function statusLabel(value: unknown) {
  const status = String(value || "").toLowerCase();
  if (["unpaid", "partial"].includes(status)) return status[0].toUpperCase() + status.slice(1);
  if (["completed", "paid", "succeeded"].includes(status)) return "Paid";
  if (["creating", "pending", "processing"].includes(status)) return "Processing";
  if (["cancelled", "canceled", "expired"].includes(status)) return "Cancelled";
  if (status === "failed") return "Failed";
  if (status === "refunded") return "Refunded";
  return status ? status.replaceAll("_", " ") : "Completion not confirmed";
}

export default function PatientBillingContent({ data }: { data: BillingData }) {
  // The billing page is for real hospital accounts only. The server loader
  // applies the same filters, and these checks prevent demo rows from leaking
  // into totals if the component receives broader data in a future refactor.
  const billsForDisplay = (data.bills ?? []).filter((bill) => bill.is_demo === false && !isDemo(bill));
  const billIds = new Set(billsForDisplay.map((bill) => bill.id));
  const charges = (data.charges ?? []).filter((charge) => charge.is_demo === false && billIds.has(charge.bill_id) && !isDemo(charge));
  const payments = (data.payments ?? []).filter((payment) => payment.is_demo === false && billIds.has(payment.bill_id) && !isDemo(payment));
  const refunds = data.refunds ?? [];

  const bills: Invoice[] = (summarizeBills(billsForDisplay, charges, payments, refunds) as Row[]).map((bill: Row): Invoice => {
    const chargeRows = charges.filter((charge) => charge.bill_id === bill.id);
    const totalValue = Number(bill.total_amount);
    const totalsKnown = Number.isFinite(totalValue) && totalValue >= 0;
    const total = totalsKnown ? Math.round(totalValue * 100) / 100 : bill.total;
    const paid = bill.paid;
    return {
      ...bill,
      items: bill.items as Row[],
      payments: bill.payments as Row[],
      totalsKnown: totalsKnown || bill.totalsKnown,
      total,
      paid,
      balance: Math.max(0, Math.round((total - paid) * 100) / 100),
      chargeRows,
    };
  });
  const totalAmount = bills.reduce((sum, bill) => sum + bill.total, 0);
  const totalPaid = bills.reduce((sum, bill) => sum + bill.paid, 0);
  const outstanding = bills.reduce((sum, bill) => sum + bill.balance, 0);
  const paymentHistory: Array<{ id: string; bill?: Invoice; date: string; reference: string; method: string; amount: number; status: string }> = payments
    .filter((payment) => verifiedPaymentStatuses.has(String(payment.status || payment.payment_status || (payment.paid_at ? "completed" : "")).toLowerCase()))
    .map((payment) => {
    const bill = bills.find((row) => row.id === payment.bill_id);
    return {
      id: `patient-${payment.id}`,
      bill,
      date: payment.paid_at || payment.payment_date || payment.created_at,
      reference: payment.reference_number || payment.receipt_number || payment.external_reference || payment.id,
      method: payment.payment_method || "Method not recorded",
      amount: Number(payment.amount || 0),
      status: payment.status || payment.payment_status || (payment.paid_at ? "completed" : ""),
    };
  });
  paymentHistory.sort((a, b) => Date.parse(String(b.date || "")) - Date.parse(String(a.date || "")));

  return <div className="patient-billing-page">
    <SummaryCards items={[
      ["Total Bill Amount", money(totalAmount), "blue"],
      ["Total Paid", money(totalPaid), "teal"],
      ["Outstanding Balance", money(outstanding), "gold"],
    ]} />

    <div className="patient-billing-records">
    <section className="patient-section-block patient-billing-section">
      <div className="patient-billing-section-heading"><div><p className="patient-eyebrow">ACCOUNT DETAILS</p><h2>Current bill details</h2></div><span>{bills.length} {bills.length === 1 ? "bill" : "bills"}</span></div>
      {!bills.length ? <div className="patient-card patient-empty"><FileText size={23} aria-hidden="true"/><p>No hospital bills have been issued to your account.</p></div> : <div className="patient-bill-list">
        {bills.map((bill) => {
          const receipt = safeReceiptUrl(bill.receipt_url);
          return <article className="patient-card patient-bill-card" key={bill.id}>
            <div className="patient-bill-details">
              <div className="patient-bill-heading"><div><p className="patient-eyebrow">HOSPITAL INVOICE</p><h3>{invoice(bill)}</h3><p>{bill.description || "Hospital services and care charges"}</p></div><div className="patient-badges"><span className="patient-status">{statusLabel(bill.status)}</span></div></div>
              <dl className="patient-bill-meta"><div><dt>Billing date</dt><dd>{formatPatientDate(bill.issued_at || bill.created_at)}</dd></div><div><dt>Payment status</dt><dd>{statusLabel(bill.status)}</dd></div></dl>
              {bill.items.length ? <ChargeTable charges={bill.items}/> : <p className="patient-info-note">No itemized charges are available. Contact the hospital billing team for clarification.</p>}
              <div className="patient-bill-totals"><div><span>Total bill amount</span><strong>{bill.totalsKnown ? money(bill.total) : "Not available"}</strong></div><div><span>Total paid</span><strong>{money(bill.paid)}</strong></div><div><span>Outstanding balance</span><strong>{bill.totalsKnown ? money(bill.balance) : "Not available"}</strong></div></div>
              {receipt && <a className="patient-secondary-button patient-receipt-link" href={receipt} target="_blank" rel="noreferrer">View bill document</a>}
            </div>

          </article>;
        })}
      </div>}
    </section>
    </div>

    <section className="patient-section-block patient-billing-section">
      <div className="patient-billing-section-heading"><div><p className="patient-eyebrow">TRANSACTION RECORDS</p><h2>Payment history</h2></div><span>{paymentHistory.length} {paymentHistory.length === 1 ? "record" : "records"}</span></div>
      {!paymentHistory.length ? <div className="patient-card patient-empty"><ShieldCheck size={23} aria-hidden="true"/><p>No verified payments have been recorded yet.</p></div> : <div className="patient-responsive-table patient-history-wrap"><table className="patient-table patient-payment-history-table">
        <caption className="patient-sr-only">Patient payment history</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Reference Number</th><th scope="col">Bill Number</th><th scope="col">Payment Method</th><th scope="col">Amount Paid</th><th scope="col">Status</th></tr></thead>
        <tbody>{paymentHistory.map((payment) => <tr key={payment.id}>
          <td>{formatPatientDate(payment.date, true)}</td><td><code>{payment.reference}</code></td><td>{invoice(payment.bill)}</td><td>{payment.method}</td><td>{money(payment.amount)}</td>
          <td><span className="patient-status">{statusLabel(payment.status)}</span></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
