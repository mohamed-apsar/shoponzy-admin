import { useState } from "react";
import { adminDownload, adminRequest } from "../api/adminApi";
import { dateTime, money, titleCase } from "../utils/format";
import {
  Badge, ConfirmDialog, ErrorBanner, Field, KeyValues, Modal, PageHeading, Pagination, StatCards, TableBody, Tabs,
  dayEnd, dayStart, qs, useAdminData, useToast,
} from "./ops/OpsKit";

/* eslint-disable react/prop-types */
const PAGE_SIZE = 20;
const METHODS = [["upi", "UPI"], ["card", "Card"], ["netbanking", "Net banking"], ["wallet", "Wallet"], ["emi", "EMI"], ["paylater", "Pay later"], ["cod", "Cash on delivery"]];
const METHOD_LABEL = Object.fromEntries(METHODS);

function methodLabel(t) {
  if (!t.method) return "—";
  const d = t.methodDetails || {};
  if (t.method === "card") return `${d.cardType ? `${titleCase(d.cardType)} card` : "Card"}${d.cardNetwork ? ` · ${d.cardNetwork}` : ""}${d.cardLast4 ? ` •••• ${d.cardLast4}` : ""}`;
  if (t.method === "upi") return `UPI${d.vpa ? ` · ${d.vpa}` : ""}`;
  if (t.method === "netbanking") return `Net banking${d.bank ? ` · ${d.bank}` : ""}`;
  if (t.method === "wallet") return `Wallet${d.wallet ? ` · ${titleCase(d.wallet)}` : ""}`;
  return METHOD_LABEL[t.method] || titleCase(t.method);
}
const shortId = (id) => (id ? `…${id.slice(-8)}` : "—");

/* ---------- Refund (existing order refund endpoint) ---------- */
function RefundDialog({ tx, onClose, onDone }) {
  const toast = useToast();
  const refundable = Math.max(0, Math.round(((tx.order?.total || tx.amount) - tx.refundedAmount) * 100) / 100);
  const [amount, setAmount] = useState(String(refundable));
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const n = Number(amount);
  const cod = tx.provider === "cod";
  const valid = n > 0 && n <= refundable && (!cod || reference.trim());
  return (
    <ConfirmDialog title="Issue refund" confirmLabel={`Refund ${money(valid ? n : 0)}`} tone="danger" disabled={!valid} onClose={onClose}
      message={cod
        ? <>Cash on delivery refunds are paid outside the system (bank transfer / UPI). Record the payment reference here.</>
        : <>The refund is sent to Razorpay for payment <span className="ops-mono">{tx.razorpayPaymentId}</span>. Its status updates when Razorpay confirms it.</>}
      onConfirm={async () => {
        await adminRequest(`/admin/orders/${tx.order.id}/refund`, { method: "POST", body: JSON.stringify({ amount: n, reason: reason.trim() || undefined, manualReference: cod ? reference.trim() : undefined }) });
        toast(`Refund of ${money(n)} ${cod ? "recorded" : "sent to Razorpay"}.`);
        onDone();
      }}>
      <div className="ops-form">
        <Field label={`Amount (max ${money(refundable)})`}><input type="number" min={0.01} max={refundable} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {cod && <Field label="Bank / UPI reference"><input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} /></Field>}
        <Field label="Reason (optional)" full><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </ConfirmDialog>
  );
}

function TransactionDetail({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data: tx, error, loading, reload } = useAdminData(`/admin/transactions/${id}`, { debounce: 0 });
  const [refunding, setRefunding] = useState(false);
  const [syncing, setSyncing] = useState("");
  const refundable = tx ? Math.round(((tx.order?.total || tx.amount) - tx.refundedAmount) * 100) / 100 : 0;
  const canRefund = tx && tx.order && ["success", "partially_refunded"].includes(tx.status) && refundable > 0 && !tx.refunds.some((r) => r.status === "pending");

  async function sync(refundId) {
    setSyncing(refundId);
    try {
      const r = (await adminRequest(`/admin/transactions/${id}/refunds/${encodeURIComponent(refundId)}/sync`, { method: "POST" })).data;
      toast(r.changed ? `Refund is now ${r.status}.` : `Razorpay reports the refund as ${r.status}; nothing changed.`);
      reload();
      onChanged();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSyncing("");
    }
  }

  return (
    <Modal wide title={tx ? `Transaction ${shortId(tx.id)}` : "Transaction"} eyebrow="PAYMENT" onClose={onClose}
      footer={<>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
        {canRefund && <button type="button" className="ops-danger-button" onClick={() => setRefunding(true)}>Issue refund</button>}
      </>}>
      <ErrorBanner error={error} onRetry={reload} />
      {!tx && loading && <p className="muted">Loading…</p>}
      {tx && <>
        <KeyValues rows={[
          ["Status", <Badge key="s" value={tx.status} />],
          ["Amount", `${money(tx.amount)} ${tx.currency}`],
          ["Transaction ID", <span key="i" className="ops-mono">{tx.id}</span>],
          ["Razorpay payment ID", tx.razorpayPaymentId ? <span key="p" className="ops-mono">{tx.razorpayPaymentId}</span> : "—"],
          ["Razorpay order ID", tx.razorpayOrderId ? <span key="o" className="ops-mono">{tx.razorpayOrderId}</span> : "—"],
          ["Shoponzy order", tx.order ? `#${tx.order.orderNumber} · ${titleCase(tx.order.status)}` : "—"],
          ["Customer", tx.customer ? <span key="c">{tx.customer.name}<br />{tx.customer.email || tx.customer.phone}</span> : "—"],
          ["Payment method", methodLabel(tx)],
          ["Card issuer", tx.methodDetails?.cardIssuer],
          ["Created", dateTime(tx.createdAt)],
          ["Captured", dateTime(tx.capturedAt)],
          ["Refunded", money(tx.refundedAmount)],
        ].filter(([, v]) => v !== undefined)} />
        {tx.failure && (
          <div className="ops-error" style={{ display: "block" }}>
            <b>Payment failed{tx.failure.code ? ` (${tx.failure.code})` : ""}</b>
            <div>{tx.failure.description || "No description returned by Razorpay."}</div>
            {(tx.failure.source || tx.failure.step || tx.failure.reason) && <small>{[tx.failure.source && `source: ${tx.failure.source}`, tx.failure.step && `step: ${tx.failure.step}`, tx.failure.reason && `reason: ${tx.failure.reason}`].filter(Boolean).join(" · ")}</small>}
          </div>
        )}
        <h3 className="ops-section-title">Refunds</h3>
        <div className="table-scroll"><table className="ops-table">
          <thead><tr><th>Refund ID</th><th className="num">Amount</th><th>Status</th><th>Initiated</th><th>Completed</th><th>By</th><th>Linked return</th><th /></tr></thead>
          <TableBody loading={false} items={tx.refunds} columns={8} empty="No refunds on this payment">
            {tx.refunds.map((r) => (
              <tr key={r.refundId}>
                <td className="mono">{r.refundId}</td><td className="num">{money(r.amount)}</td>
                <td><Badge value={r.status} />{r.failureReason && <><br /><small className="muted">{r.failureReason}</small></>}</td>
                <td>{dateTime(r.initiatedAt)}</td><td>{dateTime(r.processedAt)}</td><td>{r.by?.name || "—"}</td>
                <td>{r.returnRequest?.returnNumber || "—"}</td>
                <td>{!r.manual && r.status === "pending" && <button type="button" className="table-action" disabled={syncing === r.refundId} onClick={() => sync(r.refundId)}>{syncing === r.refundId ? "Checking…" : "Check status"}</button>}</td>
              </tr>
            ))}
          </TableBody>
        </table></div>
        <p className="ops-hint">Payment and refund statuses come from verified Razorpay responses and signed webhooks. Card numbers are never stored — only the network, type and last four digits Razorpay returns.</p>
      </>}
      {refunding && tx && <RefundDialog tx={tx} onClose={() => setRefunding(false)} onDone={() => { reload(); onChanged(); }} />}
    </Modal>
  );
}

function TransactionsTable({ status: fixedStatus, provider, method: fixedMethod, title, description, refreshKey, onOpen, compact = false }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const filters = { q: q.trim(), status: fixedStatus || status, provider, method: fixedMethod || method, from: dayStart(from), to: dayEnd(to), sort };
  const { data, meta, loading, error, reload } = useAdminData(`/admin/transactions?${qs({ ...filters, page, limit: compact ? 8 : PAGE_SIZE, r: refreshKey })}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  async function exportCsv() {
    setExporting(true);
    try {
      await adminDownload(`/admin/transactions/export.csv?${qs(filters)}`, `shoponzy-transactions-${new Date().toISOString().slice(0, 10)}.csv`);
      toast("Transaction report exported.");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>{title || (compact ? "Latest transactions" : fixedStatus ? `${titleCase(fixedStatus === "success" ? "successful" : fixedStatus)} payments` : "All transactions")}</h2>
          <p className="muted">{description || (compact ? "Most recent payment attempts." : "Search by transaction ID, Razorpay payment/order ID, order number or customer.")}</p></div>
        {!compact && (
          <div className="ops-filters">
            <input type="search" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search IDs, order or customer…" aria-label="Search transactions" />
            {!fixedStatus && (
              <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Filter by status">
                <option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option><option value="refunded">Refunded</option><option value="partially_refunded">Partially refunded</option>
              </select>
            )}
            {!fixedMethod && (
              <select value={method} onChange={(e) => reset(setMethod)(e.target.value)} aria-label="Filter by payment method">
                <option value="">All methods</option>{METHODS.filter(([id]) => provider !== "razorpay" || id !== "cod").map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            )}
            <label>From <input type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
            <label>To <input type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} /></label>
            <select value={sort} onChange={(e) => reset(setSort)(e.target.value)} aria-label="Sort">
              <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount_high">Amount: high to low</option><option value="amount_low">Amount: low to high</option>
            </select>
            <button type="button" className="secondary-button" disabled={exporting} onClick={exportCsv}>{exporting ? "Exporting…" : "Export CSV"}</button>
          </div>
        )}
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Transaction ID</th><th>Razorpay payment ID</th><th>Razorpay order ID</th><th>Order</th><th>Customer</th><th className="num">Amount</th><th>Method</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={10} empty="No transactions found" emptyHint={q || status || method || from || to ? "Try clearing the search or filters." : "Payments appear here as customers check out."}>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="mono" title={t.id}>{shortId(t.id)}</td>
                <td className="mono">{t.razorpayPaymentId || "—"}</td>
                <td className="mono">{t.razorpayOrderId || "—"}</td>
                <td>{t.order ? `#${t.order.orderNumber}` : "—"}</td>
                <td>{t.customer?.name || "—"}{t.customer?.email && <><br /><small className="muted">{t.customer.email}</small></>}</td>
                <td className="num"><b>{money(t.amount)}</b>{t.refundedAmount > 0 && <><br /><small className="muted">−{money(t.refundedAmount)} refunded</small></>}</td>
                <td>{methodLabel(t)}</td>
                <td><Badge value={t.status} />{t.failure?.description && <><br /><small className="muted" title={t.failure.description}>{t.failure.description.slice(0, 40)}{t.failure.description.length > 40 ? "…" : ""}</small></>}</td>
                <td>{dateTime(t.createdAt)}</td>
                <td><button type="button" className="table-action" onClick={() => onOpen(t.id)}>View</button></td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      {!compact && <Pagination meta={meta} page={page} onPage={setPage} />}
    </section>
  );
}

function RefundsTable({ onOpen, refreshKey, compact = false }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(compact ? "pending" : "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useAdminData(`/admin/refunds?${qs({ q: q.trim(), status, from: dayStart(from), to: dayEnd(to), page, limit: compact ? 5 : PAGE_SIZE, r: refreshKey })}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>{compact ? "Refunds awaiting Razorpay" : "Refund tracking"}</h2><p className="muted">Every refund with its original payment, order and (if any) return request.</p></div>
        {!compact && (
          <div className="ops-filters">
            <input type="search" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Refund ID, payment ID, order or customer…" aria-label="Search refunds" />
            <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Filter by refund status">
              <option value="">All refund statuses</option><option value="pending">Pending</option><option value="processed">Completed</option><option value="failed">Failed</option>
            </select>
            <label>From <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
            <label>To <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></label>
          </div>
        )}
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Refund ID</th><th>Payment ID</th><th>Order</th><th>Customer</th><th className="num">Amount</th><th>Status</th><th>Initiated</th><th>Completed</th><th>Return</th><th>Actions</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={10} empty={compact ? "No refunds pending" : "No refunds found"} emptyHint={compact ? "Every refund has been confirmed by Razorpay." : "Refunds issued from orders or returns appear here."}>
            {rows.map((r) => (
              <tr key={r.refundId}>
                <td className="mono">{r.refundId}{r.manual && <><br /><small className="muted">manual (COD)</small></>}</td>
                <td className="mono">{r.razorpayPaymentId || "—"}</td>
                <td>{r.order ? `#${r.order.orderNumber}` : "—"}</td>
                <td>{r.customer?.name || "—"}</td>
                <td className="num"><b>{money(r.amount)}</b></td>
                <td><Badge value={r.status} />{r.failureReason && <><br /><small className="muted">{r.failureReason}</small></>}</td>
                <td>{dateTime(r.initiatedAt)}</td>
                <td>{dateTime(r.processedAt)}</td>
                <td>{r.returnRequest?.returnNumber || "—"}</td>
                <td><button type="button" className="table-action" onClick={() => onOpen(r.transactionId)}>Transaction</button></td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      {!compact && <Pagination meta={meta} page={page} onPage={setPage} />}
    </section>
  );
}

/* ---------- Payment method details: breakdown per method ---------- */
const METHOD_NAMES = { ...METHOD_LABEL, unknown: "Not chosen yet" };
function MethodsView({ summary, onOpen, refreshKey }) {
  const [method, setMethod] = useState("");
  const rows = summary?.byMethod || [];
  return (
    <div className="ops-stack">
      <section className="panel table-panel">
        <div className="ops-toolbar"><div><h2>Payments by method</h2><p className="muted">Only the details Razorpay returns are stored — card network, type and last 4 digits, UPI ID, bank or wallet. Full card numbers and CVVs are never received or kept.</p></div></div>
        <div className="table-scroll">
          <table className="ops-table" style={{ minWidth: 720 }}>
            <thead><tr><th>Method</th><th className="num">Transactions</th><th className="num">Successful</th><th className="num">Failed</th><th className="num">Success rate</th><th className="num">Amount received</th><th className="num">Refunded</th><th /></tr></thead>
            <TableBody loading={!summary} items={rows} columns={8} empty="No payments yet" emptyHint="Payment methods appear once customers check out.">
              {rows.map((m) => (
                <tr key={m.method} className={method === m.method ? "ops-row-selected" : ""}>
                  <td><strong>{METHOD_NAMES[m.method] || titleCase(m.method)}</strong></td>
                  <td className="num">{m.total}</td><td className="num">{m.successful}</td><td className="num">{m.failed}</td>
                  <td className="num">{m.successRate === null ? "—" : `${m.successRate}%`}</td>
                  <td className="num"><b>{money(m.amount)}</b></td><td className="num">{m.refunded ? money(m.refunded) : "—"}</td>
                  <td>{m.method !== "unknown" && <button type="button" className="table-action" onClick={() => setMethod(method === m.method ? "" : m.method)}>{method === m.method ? "Hide" : "View payments"}</button>}</td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      </section>
      {method && <TransactionsTable key={method} method={method} title={`${METHOD_NAMES[method]} payments`} description="Each payment with the method details Razorpay reported." onOpen={onOpen} refreshKey={refreshKey} />}
    </div>
  );
}

/* ---------- Transaction reports (CSV) ---------- */
const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const PRESETS = [
  ["today", "Today", () => { const t = isoDay(new Date()); return [t, t]; }],
  ["7d", "Last 7 days", () => [isoDay(new Date(Date.now() - 6 * 86_400_000)), isoDay(new Date())]],
  ["30d", "Last 30 days", () => [isoDay(new Date(Date.now() - 29 * 86_400_000)), isoDay(new Date())]],
  ["month", "This month", () => { const n = new Date(); return [isoDay(new Date(n.getFullYear(), n.getMonth(), 1)), isoDay(n)]; }],
  ["all", "All time", () => ["", ""]],
];
function ReportsView() {
  const toast = useToast();
  const [preset, setPreset] = useState("30d");
  const [[from, to], setRange] = useState(PRESETS[2][2]());
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [exporting, setExporting] = useState(false);
  const filters = { status, method, from: dayStart(from), to: dayEnd(to) };
  const preview = useAdminData(`/admin/transactions?${qs({ ...filters, limit: 1 })}`, { debounce: 200 });
  const count = preview.meta?.total;
  const s = preview.meta?.summary;
  const choose = (id) => { setPreset(id); setRange(PRESETS.find((p) => p[0] === id)[2]()); };

  async function download() {
    setExporting(true);
    try {
      const name = `shoponzy-transactions-${from || "all"}${to && to !== from ? `-to-${to}` : ""}.csv`;
      await adminDownload(`/admin/transactions/export.csv?${qs(filters)}`, name);
      toast(`Report downloaded (${count} transaction${count === 1 ? "" : "s"}).`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="panel">
      <div className="ops-toolbar"><div><h2>Download a transaction report</h2><p className="muted">CSV with transaction, Razorpay payment and order IDs, customer, amount, currency, method, status, refund amount and status, and date.</p></div></div>
      <div className="ops-form">
        <Field label="Period" full>
          <div className="ops-segment" role="radiogroup" aria-label="Report period" style={{ flexWrap: "wrap" }}>
            {PRESETS.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={preset === id} className={preset === id ? "active" : ""} onClick={() => choose(id)}>{label}</button>)}
          </div>
        </Field>
        <Field label="From"><input type="date" value={from} max={to || undefined} onChange={(e) => { setPreset(""); setRange([e.target.value, to]); }} /></Field>
        <Field label="To"><input type="date" value={to} min={from || undefined} onChange={(e) => { setPreset(""); setRange([from, e.target.value]); }} /></Field>
        <Field label="Payment status">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option><option value="refunded">Refunded</option><option value="partially_refunded">Partially refunded</option>
          </select>
        </Field>
        <Field label="Payment method">
          <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All methods</option>{METHODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </Field>
      </div>
      <ErrorBanner error={preview.error} onRetry={preview.reload} />
      <div className="ops-preview">
        {preview.loading && count === undefined ? "Counting transactions…" : <>{count ?? 0} transaction{count === 1 ? "" : "s"} match{s ? <> · {money(s.totalAmount)} received · {money(s.totalRefunded)} refunded</> : null}</>}
      </div>
      <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
        <button type="button" className="primary-button" disabled={exporting || !count} onClick={download}>{exporting ? "Preparing…" : "Download CSV"}</button>
      </div>
    </section>
  );
}

/* One page per sidebar entry; App.jsx maps the sidebar names to these view ids. */
const VIEW_COPY = {
  razorpay: ["Razorpay Transactions", "Online payments made through Razorpay — search by transaction ID, Razorpay payment or order ID, order number or customer."],
  status: ["Payment Success & Failure", "Which payments succeeded, failed or are still pending — with the reason Razorpay gave for each failure."],
  refunds: ["Refund Tracking", "Every refund with its original payment, order and linked return, and its status at Razorpay."],
  methods: ["Payment Methods", "How customers pay, how often each method succeeds, and the details of each payment."],
  reports: ["Transaction Reports", "Download transaction reports as CSV for any period, status or payment method."],
};
const STATUS_TABS = [{ id: "success", label: "Successful" }, { id: "failed", label: "Failed" }, { id: "pending", label: "Pending" }, { id: "refunded", label: "Refunded" }];

export default function TransactionsPage({ view = "razorpay" }) {
  const [openId, setOpenId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState("success");
  const summary = useAdminData(`/admin/transactions/summary?r=${refreshKey}`, { debounce: 0 });
  const s = summary.data;
  const cards = [
    { label: "Total transactions", value: s ? s.totalTransactions.toLocaleString("en-IN") : "" },
    { label: "Successful payments", value: s ? s.successful.toLocaleString("en-IN") : "", tone: "green", note: s?.refundedTransactions ? `${s.refundedTransactions} with refunds` : "captured by Razorpay / COD collected" },
    { label: "Failed payments", value: s ? s.failed.toLocaleString("en-IN") : "", tone: "red" },
    { label: "Pending payments", value: s ? s.pending.toLocaleString("en-IN") : "", tone: "amber", note: "checkout opened, not paid" },
    { label: "Total payment amount", value: s ? money(s.totalAmount) : "", tone: "green", note: "received (before refunds)" },
    { label: "Total refunded", value: s ? money(s.totalRefunded) : "", tone: "slate", note: s?.refundsPending?.count ? `${money(s.refundsPending.amount)} pending at Razorpay` : "confirmed by Razorpay" },
  ];
  const common = { onOpen: setOpenId, refreshKey };
  const [title, description] = VIEW_COPY[view] || VIEW_COPY.razorpay;
  const counts = { success: s?.successful, failed: s?.failed, pending: s?.pending, refunded: s?.refundedTransactions };

  return (
    <>
      <PageHeading eyebrow="TRANSACTIONS & PAYMENTS" title={title} description={description} />
      <ErrorBanner error={summary.error} onRetry={summary.reload} />
      <StatCards items={cards} loading={!s && summary.loading} />
      {view === "razorpay" && <TransactionsTable key="rzp" provider="razorpay" title="Razorpay transactions" {...common} />}
      {view === "status" && <>
        <Tabs label="Payment status" tabs={STATUS_TABS.map((t) => ({ ...t, count: counts[t.id] || null }))} active={status} onChange={setStatus} />
        <TransactionsTable key={status} status={status} {...common} />
      </>}
      {view === "refunds" && <RefundsTable {...common} />}
      {view === "methods" && <MethodsView summary={s} {...common} />}
      {view === "reports" && <ReportsView />}
      {openId && <TransactionDetail id={openId} onClose={() => setOpenId(null)} onChanged={() => setRefreshKey((k) => k + 1)} />}
    </>
  );
}
