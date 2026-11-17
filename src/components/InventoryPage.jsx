import { useEffect, useState } from "react";
import { adminDownload, adminRequest } from "../api/adminApi";
import { dateTime, titleCase } from "../utils/format";
import CancelConfirmButton from "./CancelConfirmButton";
import {
  Badge, ConfirmDialog, ErrorBanner, ExportButton, Field, Modal, MoreMenu, PageHeading, Pagination, StatCards, TableBody, Thumb,
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

/* ---------- Adjust stock: add / remove / set exact, with a reason and a confirmation step ---------- */
function AdjustStockModal({ row, onClose, onSaved }) {
  const toast = useToast();
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = Number(qty);
  const valid = qty !== "" && Number.isInteger(n) && n >= 0;

  async function save() {
    setBusy(true);
    setError("");
    try {
      await adminRequest(`/admin/products/${row.productId}/stock`, {
        method: "POST",
        body: JSON.stringify({ variantId: row.variantId, set: n, expectedStock: row.stock, note: `Stock quantity set to ${n} from the inventory page.` }),
      });
      toast(`Stock for ${row.name}${variantText(row) ? ` (${variantText(row)})` : ""} updated to ${n}.`);
      onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError.message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Update stock" eyebrow="INVENTORY" onClose={onClose} busy={busy} footer={<>
      <CancelConfirmButton className="secondary-button" onCancel={onClose} disabled={busy} />
      <button type="button" className="primary-button" disabled={!valid || n === row.stock || busy} onClick={save}>Update stock</button>
    </>}>
      <div className="ops-product" style={{ marginBottom: 14 }}><Thumb src={row.image} /><div><strong>{row.name}</strong><small>{[variantText(row), row.sku].filter(Boolean).join(" · ") || "Single variant"}</small></div></div>
      <div className="ops-form">
        <Field label="Current stock"><div className="ops-preview">{fmt(row.stock)}</div></Field>
        <Field label="New stock quantity"><input type="number" min="0" step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></Field>
      </div>
      {error && <div className="products-form-error" role="alert">{error}</div>}
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
function StockTable({ stockStatus, onAdjusted, onHistory, onNavigate, storeThreshold, title, description, defaultSort = "newest" }) {
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState(null);
  const [threshold, setThreshold] = useState(null);
  const effectiveStatus = stockStatus || status;
  const path = `/admin/inventory?${qs({ page, limit: PAGE_SIZE, stockStatus: effectiveStatus, sort })}`;
  const { data, meta, loading, error, reload } = useAdminData(path, { debounce: 0 });
  const rows = data || [];
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  const saved = () => { reload(); onAdjusted(); };

  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>{title || (stockStatus === "low" ? "Low-stock variants" : stockStatus === "out" ? "Out-of-stock variants" : "Stock list")}</h2>
          <p className="muted">{description || (stockStatus === "low" ? `Variants at or below their alert level (store default ${storeThreshold ?? "…"}).` : stockStatus === "out" ? "Active variants with no units left to sell." : "Available stock per variant. Units in unshipped orders are shown as reserved.")}</p></div>
        <div className="ops-filters">
          {!stockStatus && (
            <select value={status} onChange={(e) => {
              const value = e.target.value;
              if (value === "update") { onNavigate?.("Update Stock"); return; }
              reset(setStatus)(value);
            }} aria-label="Filter by stock status">
              <option value="">All stock statuses</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="inactive">Inactive variants</option>
              <option value="update">Update Stock</option>
            </select>
          )}
          <select value={sort} onChange={(e) => reset(setSort)(e.target.value)} aria-label="Sort">
            <option value="newest">Newest products first</option><option value="stock_low">Stock: low to high</option><option value="stock_high">Stock: high to low</option><option value="name">Name A–Z</option><option value="updated">Recently updated</option>
          </select>
          <ExportButton path={`/admin/inventory/export.csv?${qs({ stockStatus: effectiveStatus, sort })}`}
            filename={`shoponzy-stock${effectiveStatus ? `-${effectiveStatus}` : ""}`} disabled={!meta?.total} />
        </div>
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th className="num">Available</th><th className="num">Reserved</th><th className="num">Alert at</th><th>Status</th><th>Last updated</th><th>Actions</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={9}
            empty={stockStatus === "out" ? "Nothing is out of stock" : stockStatus === "low" ? "No low-stock items" : "No products match"}
            emptyHint={status ? "Try changing the stock status filter." : stockStatus ? "Great — stock levels are healthy." : "Add products under Manage Products."}>
            {rows.map((row) => (
              <tr key={row.variantId} className={row.stockStatus === "low" ? "ops-row-low" : row.stockStatus === "out" ? "ops-row-out" : ""}>
                <td><div className="ops-product"><Thumb src={row.image} alt="" /><div><strong>{row.name}</strong><small>{variantText(row) || "Single variant"}{row.productStatus !== "active" ? ` · ${row.productStatus}` : ""}</small></div></div></td>
                <td className="mono">{row.sku || "—"}</td>
                <td>{row.category?.name || "—"}</td>
                <td className="num"><b>{fmt(row.stock)}</b></td>
                <td className="num">{row.reserved ? fmt(row.reserved) : "—"}</td>
                <td className="num">{row.threshold}<small>{row.productThreshold !== null && row.productThreshold !== undefined ? "product" : "default"}</small></td>
                <td><Badge value={row.stockStatus} /></td>
                <td>{dateTime(row.lastUpdated)}</td>
                <td><div className="ops-actions">
                  <button type="button" className="table-action" onClick={() => setAdjusting(row)}>{row.stockStatus === "out" ? "Restock" : "Update stock"}</button>
                  <MoreMenu label={`More actions for ${row.name}`} items={[
                    { label: "Set alert level", onClick: () => setThreshold(row) },
                    { label: "View stock history", onClick: () => onHistory(row) },
                  ]} />
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
            <div className="ops-daterange" role="group" aria-label="Date range"><span>From</span><input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} /><span>To</span><input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} /></div>
            <button type="button" className="secondary-button" disabled={exporting} onClick={exportCsv}>{exporting ? "Exporting…" : "⤓ Export CSV"}</button>
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

export default function InventoryPage({ view = "stock", onNavigate }) {
  const [historyProduct, setHistoryProduct] = useState(null);
  // The product filter only applies to the visit that set it.
  useEffect(() => { if (view !== "history") setHistoryProduct(null); }, [view]);
  const summary = useAdminData("/admin/inventory/summary", { debounce: 0 });
  const reloadSummary = summary.reload;
  useEffect(() => {
    const refresh = () => reloadSummary();
    window.addEventListener("admin:data-changed", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("admin:data-changed", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [reloadSummary]);
  const s = summary.data;
  const threshold = s?.lowStockThreshold;

  const cardValue = (value) => value == null ? "—" : fmt(value);
  const cards = [
    { label: "Total products", value: cardValue(s?.totalProducts), note: `${cardValue(s?.totalVariants)} active variants; excludes archived products` },
    { label: "Available stock", value: cardValue(s?.totalStock), note: "units across active variants", tone: "green" },
    { label: "Reserved", value: cardValue(s?.reservedUnits), note: "in unshipped orders", tone: "slate" },
    { label: "Low-stock products", value: cardValue(s?.lowStockProducts), note: `${cardValue(s?.lowStockVariants)} variants with 1+ units at or below alert level`, tone: "amber" },
    { label: "Out-of-stock products", value: cardValue(s?.outOfStockProducts), note: `${cardValue(s?.outOfStockVariants)} zero-stock variants; products with no sellable units`, tone: "red" },
  ];
  // "History" on a row opens Stock Adjustments filtered to that product.
  const openHistory = (row) => { setHistoryProduct({ productId: row.productId, name: row.name }); onNavigate?.("Stock Adjustments"); };
  const props = { onAdjusted: summary.reload, onHistory: openHistory, onNavigate, storeThreshold: threshold };
  const [title, description] = VIEW_COPY[view] || VIEW_COPY.stock;

  return (
    <>
      <PageHeading eyebrow="INVENTORY MANAGEMENT" title={title} description={description} />
      <ErrorBanner error={summary.error} onRetry={summary.reload} />
      <StatCards items={cards} loading={!s && summary.loading} />
      {view === "stock" && <StockTable key="stock" {...props} />}
      {view === "update" && <StockTable key="update" {...props} defaultSort="newest" title="Find a product to update"
        description="Choose Update stock on a variant. Newly added products appear first." />}
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
