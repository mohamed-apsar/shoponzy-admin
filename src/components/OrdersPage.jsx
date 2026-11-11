import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "../api/adminApi";
import { API_BASE } from "../api/config";
import { dateTime, money, shortDate, titleCase } from "../utils/format";

/* eslint-disable react/prop-types */
const STATUS_CLASS = {
  pending_payment: "pending", placed: "pending", confirmed: "processing", packed: "processing",
  shipped: "shipped", delivered: "delivered", cancelled: "cancelled", returned: "cancelled",
};
const STATUSES = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned", "pending_payment"];
const STATUS_DROPDOWN_OPTIONS = [
  ["confirmed", "Confirm"], ["packed", "Packed"], ["shipped", "Shipped"], ["cancelled", "Cancelled"], ["delivered", "Delivered"],
];
const STATUS_TRANSITIONS = {
  pending_payment: ["cancelled"],
  placed: ["confirmed", "packed", "shipped", "cancelled"],
  confirmed: ["packed", "shipped", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [], cancelled: [], returned: [],
};
const PAGE_SIZE = 20;

export function OrderStatus({ status }) {
  return <span className={`status ${STATUS_CLASS[status] || "pending"}`}>{titleCase(status)}</span>;
}

const paymentLabel = (order) => `${order.paymentMethod === "cod" ? "COD" : "Prepaid"} · ${titleCase(order.paymentStatus || "pending")}`;

export function OrdersTable({ items, onOpen, onStatusChange, busyOrderId }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Order ID</th><th>Customer</th><th>Date</th>
            <th>Total</th><th>Payment</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id} onClick={onOpen ? () => onOpen(order) : undefined} style={onOpen ? { cursor: "pointer" } : undefined}>
              <td className="order-id">#{order.orderNumber}</td>
              <td>{order.contact?.name || order.customer}</td>
              <td>{shortDate(order.placedAt || order.createdAt)}</td>
              <td>{money(order.total)}</td>
              <td>{paymentLabel(order)}</td>
              <td onClick={(event) => event.stopPropagation()}>
                {onStatusChange && (STATUS_TRANSITIONS[order.status] || []).length > 0 ? (
                  <select
                    className={`order-status-dropdown status-${STATUS_CLASS[order.status] || "pending"}`}
                    value={order.status}
                    disabled={busyOrderId === order.id}
                    aria-label={`Status for order ${order.orderNumber}`}
                    onChange={(event) => onStatusChange(order, event.target.value)}
                  >
                    {!STATUS_DROPDOWN_OPTIONS.some(([value]) => value === order.status) && <option value={order.status} disabled>{titleCase(order.status)}</option>}
                    {STATUS_DROPDOWN_OPTIONS.filter(([value]) => value === order.status || (STATUS_TRANSITIONS[order.status] || []).includes(value)).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                ) : <OrderStatus status={order.status} />}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={6} className="empty-state">No matching orders found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function OrderDetail({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fulfilment, setFulfilment] = useState({ courier: "", trackingNumber: "", trackingUrl: "" });
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await adminRequest(`/admin/orders/${id}`);
      setData(result.data);
      const f = result.data.order.fulfilment || {};
      setFulfilment({ courier: f.courier || "", trackingNumber: f.trackingNumber || "", trackingUrl: f.trackingUrl || "" });
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      onChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const trackingBody = () => Object.fromEntries(Object.entries(fulfilment).map(([k, v]) => [k, v.trim()]));

  function changeStatus(status) {
    if (status === "cancelled") {
      if (!window.confirm("Cancel this order? Reserved stock is released.")) return;
      return run(() => adminRequest(`/admin/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: note.trim() || undefined }) }));
    }
    const body = { status, ...(note.trim() ? { note: note.trim() } : {}) };
    if (status === "shipped") {
      const f = Object.fromEntries(Object.entries(trackingBody()).filter(([, v]) => v));
      if (Object.keys(f).length) body.fulfilment = f;
    }
    if (status === "returned") body.restock = window.confirm("Put the returned items back into stock?");
    return run(() => adminRequest(`/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify(body) }).then(() => setNote("")));
  }

  const order = data?.order;
  const a = order?.shippingAddress || {};

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="order-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div><p className="eyebrow">ORDER</p><h2 id="order-title">{order ? `#${order.orderNumber}` : "Loading…"}</h2></div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        {error && <div className="products-form-error" role="alert">{error}</div>}
        {order && (
          <>
            <div className="products-form-grid">
              <div className="products-form-field"><span>Status</span><div><OrderStatus status={order.status} /></div></div>
              <div className="products-form-field"><span>Payment</span><div>{paymentLabel(order)}</div></div>
              <div className="products-form-field"><span>Customer</span><div>{order.contact?.name}<br />{order.contact?.phone}{order.contact?.email ? <><br />{order.contact.email}</> : null}</div></div>
              <div className="products-form-field"><span>Deliver to</span><div>{a.name}<br />{a.line1}{a.line2 ? <>, {a.line2}</> : null}<br />{a.city}, {a.state} {a.pincode}<br />{a.phone}</div></div>
              <div className="products-form-field"><span>Placed</span><div>{dateTime(order.placedAt || order.createdAt)}</div></div>
              {order.needsAttention && <div className="products-form-field"><span>Needs attention</span><div className="products-form-error">{order.needsAttention}</div></div>}
            </div>

            <div className="table-scroll" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Item</th><th>Variant</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
                <tbody>
                  {order.items.map((item, index) => (
                    <tr key={index}><td>{item.name}{item.sku ? <><br /><small className="muted">{item.sku}</small></> : null}</td><td>{[item.color, item.size].filter(Boolean).join(" / ") || "—"}</td><td>{money(item.price)}</td><td>{item.qty}</td><td>{money(item.lineTotal)}</td></tr>
                  ))}
                  <tr><td colSpan={4}>Subtotal</td><td>{money(order.subtotal)}</td></tr>
                  {order.couponDiscount > 0 && <tr><td colSpan={4}>Coupon {order.couponCode}</td><td>−{money(order.couponDiscount)}</td></tr>}
                  {order.prepaidDiscount > 0 && <tr><td colSpan={4}>Prepaid discount</td><td>−{money(order.prepaidDiscount)}</td></tr>}
                  <tr><td colSpan={4}>Delivery</td><td>{order.shippingFee ? money(order.shippingFee) : "Free"}</td></tr>
                  <tr><td colSpan={4}><strong>Total</strong></td><td><strong>{money(order.total)}</strong></td></tr>
                  {order.refundedAmount > 0 && <tr><td colSpan={4}>Refunded</td><td>−{money(order.refundedAmount)}</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="products-form-grid" style={{ marginTop: 16 }}>
              <label className="products-form-field">Courier<input value={fulfilment.courier} onChange={(e) => setFulfilment((f) => ({ ...f, courier: e.target.value }))} placeholder="e.g. Delhivery" /></label>
              <label className="products-form-field">Tracking number<input value={fulfilment.trackingNumber} onChange={(e) => setFulfilment((f) => ({ ...f, trackingNumber: e.target.value }))} /></label>
              <label className="products-form-field products-form-full">Tracking URL<input type="url" value={fulfilment.trackingUrl} onChange={(e) => setFulfilment((f) => ({ ...f, trackingUrl: e.target.value }))} placeholder="https://" /></label>
              <label className="products-form-field products-form-full">Note for the status change (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></label>
            </div>

            <div className="modal-actions" style={{ flexWrap: "wrap" }}>
              <a className="secondary-button" href={`${API_BASE}/admin/orders/${order.id}/invoice`} target="_blank" rel="noopener noreferrer">Invoice</a>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => run(() => adminRequest(`/admin/orders/${id}/fulfilment`, { method: "PATCH", body: JSON.stringify(trackingBody()) }))}>Save tracking</button>
              {(data.allowedTransitions || []).map((status) => (
                <button key={status} type="button" className={status === "cancelled" ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => changeStatus(status)}>
                  {status === "cancelled" ? "Cancel order" : `Mark ${titleCase(status)}`}
                </button>
              ))}
            </div>

            {!!data.returns?.length && (
              <div style={{ marginTop: 16 }}>
                <h3>Return requests</h3>
                <ul className="muted">{data.returns.map((r) => <li key={r.id}>{r.returnNumber} — {titleCase(r.status)} · {r.quantity} item(s) · refund {titleCase(r.refundStatus || "not_applicable")}{r.refundAmount ? ` (${money(r.refundAmount)})` : ""} · {shortDate(r.createdAt)} <small>(manage under Returns &amp; Refunds)</small></li>)}</ul>
              </div>
            )}

            {!!order.history?.length && (
              <div style={{ marginTop: 16 }}>
                <h3>History</h3>
                <ul className="muted">{order.history.map((h, index) => <li key={index}>{titleCase(h.status)} — {dateTime(h.at)}{h.by?.name ? ` by ${h.by.name}` : ""}{h.note ? ` · ${h.note}` : ""}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default function OrdersPage({ query = "", onCountsChange }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      const result = await adminRequest(`/admin/orders?${params}`);
      setItems(result.data);
      setMeta(result.meta || {});
      onCountsChange?.(result.meta?.statusCounts || {});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [page, query, status, onCountsChange]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => { setPage(1); }, [query, status]);

  async function changeTableStatus(order, nextStatus) {
    if (nextStatus === order.status) return;
    if (nextStatus === "cancelled" && !window.confirm(`Cancel order #${order.orderNumber}?`)) {
      await load();
      return;
    }
    setBusyOrderId(order.id);
    setError("");
    setItems((current) => current.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item));
    try {
      if (nextStatus === "cancelled") {
        await adminRequest(`/admin/orders/${order.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled from the order status dropdown" }) });
      } else {
        await adminRequest(`/admin/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      }
      await load();
    } catch (requestError) {
      setItems((current) => current.map((item) => item.id === order.id ? { ...item, status: order.status } : item));
      await load();
      setError(requestError.message);
    } finally {
      setBusyOrderId(null);
    }
  }

  const counts = meta.statusCounts || {};
  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">SALES</p><h1>Manage Orders</h1><p className="muted">Review customer orders and update their status. Click an order to open it.</p></div>
      </div>
      <section className="panel table-panel">
        <div className="product-toolbar">
          <div><h2>Orders</h2><p className="muted">{loading ? "Loading…" : `${meta.total ?? items.length} orders`}</p></div>
          <div className="products-filter-controls">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}{counts[s] ? ` (${counts[s]})` : ""}</option>)}
            </select>
          </div>
        </div>
        {error && <div className="products-form-error" role="alert">{error}</div>}
        <OrdersTable items={items} onOpen={(order) => setOpenId(order.id)} onStatusChange={changeTableStatus} busyOrderId={busyOrderId} />
        {(meta.pages || 1) > 1 && (
          <div className="action-buttons" style={{ justifyContent: "flex-end", padding: "12px 0" }}>
            <button className="table-action" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
            <span className="muted">Page {page} of {meta.pages}</span>
            <button className="table-action" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
          </div>
        )}
      </section>
      {openId && <OrderDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
