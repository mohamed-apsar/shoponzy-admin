import { useEffect, useMemo, useState } from "react";
import { adminDownload, adminRequest } from "../api/adminApi";
import { dateTime, titleCase } from "../utils/format";
import {
  Badge, ConfirmDialog, ErrorBanner, Field, Modal, PageHeading, Pagination, StatCards, TableBody, Thumb,
  dayEnd, dayStart, qs, useAdminData, useToast,
} from "./ops/OpsKit";

/* eslint-disable react/prop-types */
const PAGE_SIZE = 20;
const REASONS = [
  ["restock", "Restock / new delivery"], ["adjustment", "General adjustment"], ["correction", "Stock count correction"],
  ["damaged", "Damaged / lost"], ["return", "Customer return"],
];
const ALL_REASONS = { ...Object.fromEntries(REASONS), order: "Order placed", order_cancelled: "Order cancelled", reservation_expired: "Unpaid order released", late_payment: "Late payment", initial: "Initial stock" };
const reasonLabel = (r) => ALL_REASONS[r] || titleCase(r);
const variantText = (row) => [row.color, row.size].filter(Boolean).join(" / ");
const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

function CategorySelect({ categories, value, onChange }) {
  const sorted = useMemo(() => {
    const byParent = new Map();
    for (const c of categories) byParent.set(c.parentId || null, [...(byParent.get(c.parentId || null) || []), c]);
    const out = [];
    const walk = (parent, depth) => (byParent.get(parent) || []).forEach((c) => { out.push({ ...c, depth }); walk(c.id, depth + 1); });
    walk(null, 0);
    return out;
  }, [categories]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter by category">
      <option value="">All categories</option>
      {sorted.map((c) => <option key={c.id} value={c.id}>{"  ".repeat(c.depth)}{c.name}</option>)}
    </select>
  );
}

/* ---------- Adjust stock: add / remove / set exact, with a reason and a confirmation step ---------- */
function AdjustStockModal({ row, onClose, onSaved }) {
  const toast = useToast();
  const [mode, setMode] = useState("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("restock");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const n = Number(qty);
  const valid = qty !== "" && Number.isInteger(n) && n >= 0 && (mode === "set" || n > 0);
  const next = !valid ? null : mode === "add" ? row.stock + n : mode === "remove" ? row.stock - n : n;
  const problem = !valid ? "" : next < 0 ? `You can remove at most ${row.stock}.` : next === row.stock ? "That's the current stock — nothing would change." : note.trim().length < 3 ? "Enter a reason (at least 3 characters)." : "";

  async function save() {
    const body = { variantId: row.variantId, reason, note: note.trim(), expectedStock: row.stock, ...(mode === "set" ? { set: n } : { delta: mode === "add" ? n : -n }) };
    await adminRequest(`/admin/products/${row.productId}/stock`, { method: "POST", body: JSON.stringify(body) });
    toast(`Stock for ${row.name}${variantText(row) ? ` (${variantText(row)})` : ""} updated to ${next}.`);
    onSaved();
  }

  if (confirming) {
    return (
      <ConfirmDialog title="Confirm stock change" confirmLabel="Confirm & save" onClose={() => setConfirming(false)} onConfirm={async () => { await save(); onClose(); }}
        message={<>Change <b>{row.name}</b>{variantText(row) && <> ({variantText(row)})</>} from <b>{row.stock}</b> to <b>{next}</b> ({next - row.stock > 0 ? "+" : ""}{next - row.stock})?</>}>
        <div className="ops-note"><b>{reasonLabel(reason)}</b> — {note.trim()}</div>
        <p className="ops-hint">This is recorded in the stock adjustment history under your name.</p>
      </ConfirmDialog>
    );
  }
  return (
    <Modal title="Update stock" eyebrow="INVENTORY" onClose={onClose} footer={<>
      <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
      <button type="button" className="primary-button" disabled={!valid || Boolean(problem)} onClick={() => setConfirming(true)}>Review change</button>
    </>}>
      <div className="ops-product" style={{ marginBottom: 14 }}><Thumb src={row.image} /><div><strong>{row.name}</strong><small>{[variantText(row), row.sku].filter(Boolean).join(" · ") || "Single variant"}</small></div></div>
      <div className="ops-form">
        <Field label="Adjustment type" full>
          <div className="ops-segment" role="radiogroup" aria-label="Adjustment type">
            {[["add", "Add stock"], ["remove", "Remove stock"], ["set", "Set exact quantity"]].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? "active" : ""} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>
        </Field>
        <Field label={mode === "set" ? "New quantity" : "Quantity"}>
          <input type="number" min={mode === "set" ? 0 : 1} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        <Field label="Reason">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </Field>
        <Field label="Reason details (required)" full>
          <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Received 24 units from supplier, invoice #1234" />
        </Field>
      </div>
      <div className={`ops-preview ${problem ? "warn" : ""}`}>
        {valid && !problem ? <>Current {row.stock} → New {next}</> : problem || `Current stock: ${row.stock}`}
      </div>
      {row.reserved > 0 && <p className="ops-hint">{row.reserved} unit(s) are held by unshipped orders; they&apos;re already excluded from the available stock above.</p>}
    </Modal>
  );
}

function ThresholdModal({ row, storeThreshold, onClose, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(row.productThreshold ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(next) {
    setBusy(true);
    setError("");
    try {
      await adminRequest(`/admin/products/${row.productId}/low-stock-threshold`, { method: "PATCH", body: JSON.stringify({ lowStockThreshold: next }) });
      toast(next === null ? `${row.name} now uses the store-wide alert level.` : `Low-stock alert for ${row.name} set to ${next}.`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  const n = Number(value);
  return (
    <Modal title="Low-stock alert level" eyebrow="INVENTORY" onClose={onClose} busy={busy} footer={<>
      {row.productThreshold !== null && row.productThreshold !== undefined && <button type="button" className="secondary-button" disabled={busy} onClick={() => save(null)}>Use store default ({storeThreshold})</button>}
      <button type="button" className="primary-button" disabled={busy || value === "" || !Number.isInteger(n) || n < 0} onClick={() => save(n)}>Save</button>
    </>}>
      <p className="ops-confirm-text">Alert when any variant of <b>{row.name}</b> has this many units or fewer. Applies to every variant of the product.</p>
      <Field label="Alert at or below"><input type="number" min={0} step={1} value={value} placeholder={`Store default: ${storeThreshold}`} onChange={(e) => setValue(e.target.value)} /></Field>
      {error && <div className="products-form-error" role="alert">{error}</div>}
    </Modal>
  );
}

/* ---------- Stock list (all / low / out) ---------- */
function StockTable({ stockStatus, categories, onAdjusted, onHistory, storeThreshold, title, description, defaultSort = "stock_low" }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(null);
  const [threshold, setThreshold] = useState(null);
  const effectiveStatus = stockStatus || status;
  const path = `/admin/inventory?${qs({ page, limit: PAGE_SIZE, q: q.trim(), category, stockStatus: effectiveStatus, sort })}`;
  const { data, meta, loading, error, reload } = useAdminData(path, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  const saved = () => { reload(); onAdjusted(); };

  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>{title || (stockStatus === "low" ? "Low-stock variants" : stockStatus === "out" ? "Out-of-stock variants" : "Stock list")}</h2>
          <p className="muted">{description || (stockStatus === "low" ? `Variants at or below their alert level (store default ${storeThreshold ?? "…"}).` : stockStatus === "out" ? "Active variants with no units left to sell." : "Available stock per variant. Units in unshipped orders are shown as reserved.")}</p></div>
        <div className="ops-filters">
          <input type="search" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search product, brand or SKU…" aria-label="Search products" />
          <CategorySelect categories={categories} value={category} onChange={reset(setCategory)} />
          {!stockStatus && (
            <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Filter by stock status">
              <option value="">All stock statuses</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="inactive">Inactive variants</option>
            </select>
          )}
          <select value={sort} onChange={(e) => reset(setSort)(e.target.value)} aria-label="Sort">
            <option value="stock_low">Stock: low to high</option><option value="stock_high">Stock: high to low</option><option value="name">Name A–Z</option><option value="updated">Recently updated</option>
          </select>
        </div>
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th className="num">Available</th><th className="num">Reserved</th><th className="num">Alert at</th><th>Status</th><th>Last updated</th><th>Actions</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={9}
            empty={stockStatus === "out" ? "Nothing is out of stock" : stockStatus === "low" ? "No low-stock items" : "No products match"}
            emptyHint={q || category || status ? "Try clearing the search or filters." : stockStatus ? "Great — stock levels are healthy." : "Add products under Manage Products."}>
            {rows.map((row) => (
              <tr key={row.variantId} className={row.stockStatus === "low" ? "ops-row-low" : row.stockStatus === "out" ? "ops-row-out" : ""}>
                <td><div className="ops-product"><Thumb src={row.image} alt="" /><div><strong>{row.name}</strong><small>{variantText(row) || "Single variant"}{row.productStatus !== "active" ? ` · ${row.productStatus}` : ""}</small></div></div></td>
                <td className="mono">{row.sku || "—"}</td>
                <td>{row.category?.name || "—"}</td>
                <td className="num"><b>{fmt(row.stock)}</b></td>
                <td className="num">{row.reserved ? fmt(row.reserved) : "—"}</td>
                <td className="num">{row.threshold}{row.productThreshold !== null && row.productThreshold !== undefined ? "" : <small className="muted"> (default)</small>}</td>
                <td><Badge value={row.stockStatus} /></td>
                <td>{dateTime(row.lastUpdated)}</td>
                <td><div className="ops-actions">
                  <button type="button" className="table-action" onClick={() => setAdjusting(row)}>{row.stockStatus === "out" ? "Restock" : "Update stock"}</button>
                  <button type="button" className="table-action" onClick={() => setThreshold(row)}>Alert level</button>
                  <button type="button" className="table-action" onClick={() => onHistory(row)}>History</button>
                </div></td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      <Pagination meta={meta} page={page} onPage={setPage} />
      {adjusting && <AdjustStockModal row={adjusting} onClose={() => setAdjusting(null)} onSaved={saved} />}
      {threshold && <ThresholdModal row={threshold} storeThreshold={storeThreshold} onClose={() => setThreshold(null)} onSaved={saved} />}
    </section>
  );
}

/* ---------- Stock adjustment history (InventoryMovement log) ---------- */
function HistoryTable({ productFilter, onClearProduct, compact = false }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("");
  const [manual, setManual] = useState(!productFilter);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const filters = { q: q.trim(), product: productFilter?.productId, reason, manual: manual && !reason ? 1 : "", from: dayStart(from), to: dayEnd(to) };
  const { data, meta, loading, error, reload } = useAdminData(`/admin/inventory/movements?${qs({ ...filters, page, limit: compact ? 5 : PAGE_SIZE })}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const reset = (fn) => (v) => { fn(v); setPage(1); };

  async function exportCsv() {
    setExporting(true);
    try {
      await adminDownload(`/admin/inventory/movements/export.csv?${qs(filters)}`, `shoponzy-stock-history-${new Date().toISOString().slice(0, 10)}.csv`);
      toast("Stock history exported.");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>{compact ? "Recent manual adjustments" : "Stock adjustment history"}</h2>
          <p className="muted">{productFilter ? <>Showing <b>{productFilter.name}</b> · <button type="button" className="ops-link" onClick={onClearProduct}>show all products</button></> : "Every stock change: manual adjustments, orders, cancellations and returns."}</p></div>
        {!compact && (
          <div className="ops-filters">
            <input type="search" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search product or SKU…" aria-label="Search history" />
            <select value={reason} onChange={(e) => reset(setReason)(e.target.value)} aria-label="Filter by reason">
              <option value="">All reasons</option>{Object.entries(ALL_REASONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <label><input type="checkbox" checked={manual} disabled={Boolean(reason)} onChange={(e) => reset(setManual)(e.target.checked)} /> Manual only</label>
            <label>From <input type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} /></label>
            <label>To <input type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} /></label>
            <button type="button" className="secondary-button" disabled={exporting} onClick={exportCsv}>{exporting ? "Exporting…" : "Export CSV"}</button>
          </div>
        )}
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Date &amp; time</th><th>Product</th><th>SKU</th><th className="num">Previous</th><th className="num">Change</th><th className="num">New</th><th>Type</th><th>Reason</th><th>Updated by</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={9} empty="No stock changes found" emptyHint={q || reason || from || to ? "Try widening the filters." : "Adjustments made here are listed with who made them."}>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{dateTime(m.createdAt)}</td>
                <td><strong>{m.product?.name || "Deleted product"}</strong>{m.variant && <><br /><small className="muted">{m.variant}</small></>}</td>
                <td className="mono">{m.sku || "—"}</td>
                <td className="num">{m.before ?? "—"}</td>
                <td className="num" style={{ color: m.delta < 0 ? "#dc2626" : "#12845b", fontWeight: 700 }}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                <td className="num">{m.after ?? "—"}</td>
                <td>{m.mode ? <Badge value={m.mode === "add" ? "in" : m.mode === "remove" ? "out" : "approved"} label={titleCase(m.mode === "set" ? "Set exact" : m.mode)} /> : <span className="muted">Automatic</span>}</td>
                <td>{reasonLabel(m.reason)}{m.note && <><br /><small className="muted">{m.note}</small></>}{m.order && <><br /><small className="muted">Order #{m.order.orderNumber}</small></>}{m.returnRequest && <><br /><small className="muted">Return {m.returnRequest.returnNumber}</small></>}</td>
                <td>{m.actor?.name || <span className="muted">System</span>}</td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      {!compact && <Pagination meta={meta} page={page} onPage={setPage} />}
    </section>
  );
}

function ThresholdSettings({ current, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState(false);
  const n = Number(value);
  const valid = value !== "" && Number.isInteger(n) && n >= 0 && n !== current;
  return (
    <section className="panel">
      <div className="ops-toolbar" style={{ marginBottom: 8 }}><div><h2>Low-stock alert level</h2><p className="muted">Store-wide default. Products can override it from the stock list (“Alert level”).</p></div></div>
      <div className="ops-filters">
        <label>Alert when stock is at or below <input type="number" min={0} step={1} style={{ width: 110 }} value={value} placeholder={current ?? "…"} onChange={(e) => setValue(e.target.value)} aria-label="Low-stock threshold" /></label>
        <button type="button" className="primary-button" disabled={!valid} onClick={() => setConfirm(true)}>Save</button>
      </div>
      {confirm && <ConfirmDialog title="Change the alert level?" confirmLabel="Save alert level" onClose={() => setConfirm(false)}
        message={<>Variants with <b>{n}</b> or fewer units will be flagged as low stock (currently {current}). Products with their own alert level keep it.</>}
        onConfirm={async () => { await adminRequest("/admin/inventory/settings", { method: "PUT", body: JSON.stringify({ lowStockThreshold: n }) }); toast(`Low-stock alert level set to ${n}.`); setValue(""); onSaved(); }} />}
    </section>
  );
}

/* One page per sidebar entry; App.jsx maps the sidebar names to these view ids. */
const VIEW_COPY = {
  stock: ["Available Stock", "Current stock for every product variant, with what unshipped orders are holding."],
  update: ["Update Stock", "Find a product, then add stock, remove stock or set an exact quantity. Every change needs a reason."],
  alerts: ["Low-Stock Alerts", "Set when products count as low on stock, and see which ones are at or below their alert level."],
  out: ["Out-of-Stock Products", "Active variants with nothing left to sell. Restock them straight from this list."],
  history: ["Stock Adjustments", "Every stock change — manual adjustments, orders, cancellations and returns — with who made it."],
};

export default function InventoryPage({ categories = [], view = "stock", onNavigate }) {
  const [historyProduct, setHistoryProduct] = useState(null);
  // The product filter only applies to the visit that set it.
  useEffect(() => { if (view !== "history") setHistoryProduct(null); }, [view]);
  const summary = useAdminData("/admin/inventory/summary", { debounce: 0 });
  const s = summary.data;
  const threshold = s?.lowStockThreshold;

  const cards = [
    { label: "Total products", value: fmt(s?.totalProducts), note: `${fmt(s?.totalVariants)} active variants` },
    { label: "Available stock", value: fmt(s?.totalStock), note: "units ready to sell", tone: "green" },
    { label: "Reserved", value: fmt(s?.reservedUnits), note: "in unshipped orders", tone: "slate" },
    { label: "Low-stock products", value: fmt(s?.lowStockProducts), note: `${fmt(s?.lowStockVariants)} variants ≤ alert level`, tone: "amber" },
    { label: "Out-of-stock products", value: fmt(s?.outOfStockProducts), note: `${fmt(s?.outOfStockVariants)} variants at 0`, tone: "red" },
  ];
  // "History" on a row opens Stock Adjustments filtered to that product.
  const openHistory = (row) => { setHistoryProduct({ productId: row.productId, name: row.name }); onNavigate?.("Stock Adjustments"); };
  const props = { categories, onAdjusted: summary.reload, onHistory: openHistory, storeThreshold: threshold };
  const [title, description] = VIEW_COPY[view] || VIEW_COPY.stock;

  return (
    <>
      <PageHeading eyebrow="INVENTORY MANAGEMENT" title={title} description={description} />
      <ErrorBanner error={summary.error} onRetry={summary.reload} />
      <StatCards items={cards} loading={!s && summary.loading} />
      {view === "stock" && <StockTable key="stock" {...props} />}
      {view === "update" && <StockTable key="update" {...props} defaultSort="name" title="Find a product to update"
        description="Search by name, brand or SKU, then choose Update stock on the variant." />}
      {view === "alerts" && (
        <div className="ops-stack">
          <ThresholdSettings current={threshold} onSaved={summary.reload} />
          <StockTable key="low" stockStatus="low" {...props} />
        </div>
      )}
      {view === "out" && <StockTable key="out" stockStatus="out" {...props} />}
      {view === "history" && <HistoryTable key={historyProduct?.productId || "all"} productFilter={historyProduct} onClearProduct={() => setHistoryProduct(null)} />}
    </>
  );
}
