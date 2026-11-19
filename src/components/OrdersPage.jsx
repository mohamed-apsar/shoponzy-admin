import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminRequest } from "../api/adminApi";
import { API_BASE } from "../api/config";
import { dateTime, money, shortDate, titleCase } from "../utils/format";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

/* eslint-disable react/prop-types */
const STATUS_CLASS = {
  pending_payment: "pending", placed: "pending", confirmed: "processing", packed: "processing",
  shipped: "shipped", delivered: "delivered", cancelled: "cancelled", returned: "cancelled",
};
const STATUSES = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned", "pending_payment"];
const STATUS_DROPDOWN_OPTIONS = [
  ["confirmed", "Confirm"], ["packed", "Packed"], ["shipped", "Shipped"], ["cancelled", "Cancelled"], ["delivered", "Delivered"],
];
const PAGE_SIZE = 20;

export function OrderStatus({ status }) {
  return <span className={`status ${STATUS_CLASS[status] || "pending"}`}>{titleCase(status)}</span>;
}

function OrderStatusDropdown({ order, onChange, busy }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const options = STATUS_DROPDOWN_OPTIONS;

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggle(event) {
    event.stopPropagation();
    if (open) return setOpen(false);
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = options.length * 40 + 8;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 150) - 8)),
      top: rect.bottom + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
      width: Math.max(rect.width, 150),
    });
    setOpen(true);
  }

  const selected = STATUS_DROPDOWN_OPTIONS.find(([value]) => value === order.status);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`order-status-dropdown status-${STATUS_CLASS[order.status] || "pending"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status for order ${order.orderNumber}`}
        disabled={busy}
        onClick={toggle}
      >
        {selected?.[1] || titleCase(order.status)}
      </button>
      {open && position && createPortal(
        <div ref={menuRef} className="order-status-menu" role="menu" style={position}>
          {options.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="menuitem"
              className={`order-status-option status-${STATUS_CLASS[value] || "pending"}`}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onChange(order, value);
              }}
            >
              {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

const paymentLabel = (order) => titleCase(order.paymentStatus || "pending");

export function OrdersTable({ items, onOpen, onStatusChange, busyOrderId }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Order ID</th><th>Customer</th><th>Date</th>
            <th>Total</th><th>Payment</th><th>Status</th>
            {onOpen && <th scope="col">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id}>
              <td className="order-id">#{order.orderNumber}</td>
              <td>{order.contact?.name || order.customer}</td>
              <td>{shortDate(order.placedAt || order.createdAt)}</td>
              <td>{money(order.total)}</td>
              <td>{paymentLabel(order)}</td>
              <td onClick={(event) => event.stopPropagation()}>
                {onStatusChange && order.status !== "returned"
                  ? <OrderStatusDropdown order={order} onChange={onStatusChange} busy={busyOrderId === order.id} />
                  : <OrderStatus status={order.status} />}
              </td>
              {onOpen && <td><button type="button" className="table-action" aria-label={`View order #${order.orderNumber}`} onClick={() => onOpen(order)}>View</button></td>}
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={onOpen ? 7 : 6} className="empty-state">No matching orders found.</td></tr>
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
  const [trackingNotice, setTrackingNotice] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

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

  async function run(action, showError = setError) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      onChanged();
    } catch (requestError) {
      showError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const trackingBody = () => Object.fromEntries(Object.entries(fulfilment).map(([k, v]) => [k, v.trim()]));

  function updateTracking(event) {
    const { name, value } = event.target;
    setFulfilment((current) => ({ ...current, [name]: value }));
    setTrackingNotice("");
    setTrackingError("");
  }

  function saveTracking(event) {
    event.preventDefault();
    if (busy) return;
    setTrackingNotice("");
    setTrackingError("");
    return run(async () => {
      await adminRequest(`/admin/orders/${id}/fulfilment`, { method: "PATCH", body: JSON.stringify(trackingBody()) });
      setTrackingNotice("Tracking saved.");
    }, setTrackingError);
  }

  function changeStatus(status) {
    if (status === "cancelled") {
      setConfirmingCancel(true);
      return;
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

            <form className="order-tracking" aria-labelledby="order-tracking-title" onSubmit={saveTracking}>
              <div>
                <h3 id="order-tracking-title">Courier and tracking</h3>
                <p className="muted">Add the courier and tracking details for this shipment.</p>
              </div>
              <div className="order-tracking-grid">
                <label className="products-form-field">Courier<input name="courier" value={fulfilment.courier} onChange={updateTracking} placeholder="e.g. Delhivery" disabled={busy} /></label>
                <label className="products-form-field">Tracking number<input name="trackingNumber" value={fulfilment.trackingNumber} onChange={updateTracking} placeholder="Enter tracking number" disabled={busy} /></label>
                <label className="products-form-field products-form-full"><span>Tracking link <small className="muted">(optional)</small></span><input name="trackingUrl" type="url" value={fulfilment.trackingUrl} onChange={updateTracking} placeholder="https://" disabled={busy} /></label>
              </div>
              {trackingError && <div className="products-form-error" role="alert">{trackingError}</div>}
              <div className="order-tracking-actions">
                <button type="submit" className="primary-button" disabled={busy}>Save tracking</button>
                {trackingNotice && <span className="muted" role="status">{trackingNotice}</span>}
              </div>
            </form>

            <label className="products-form-field order-status-note">Note for the status change (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></label>

            <div className="modal-actions" style={{ flexWrap: "wrap" }}>
              <a className="secondary-button" href={`${API_BASE}/admin/orders/${order.id}/invoice`} target="_blank" rel="noopener noreferrer">Invoice</a>
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
      {confirmingCancel && <DeleteConfirmDialog
        title="Cancel this order?"
        message="The order will be cancelled and its reserved stock released."
        confirmLabel="Yes, Cancel"
        errorFallback="The order could not be cancelled."
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await adminRequest(`/admin/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: note.trim() || undefined }) });
            await load();
            onChanged();
          } catch (requestError) {
            setError(requestError.message);
            throw requestError;
          } finally {
            setBusy(false);
          }
        }}
      />}
    </div>
  );
}

export default function OrdersPage({ query = "" }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [pendingCancelOrder, setPendingCancelOrder] = useState(null);

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
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [page, query, status]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => { setPage(1); }, [query, status]);

  async function changeTableStatus(order, nextStatus, confirmed = false) {
    if (nextStatus === order.status) return;
    if (nextStatus === "cancelled" && !confirmed) {
      setPendingCancelOrder(order);
      return;
    }
    setBusyOrderId(order.id);
    setError("");
    setItems((current) => current.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item));
    try {
      if (nextStatus === "cancelled") {
        await adminRequest(`/admin/orders/${order.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: "Cancelled from the order status dropdown", force: true }) });
      } else {
        await adminRequest(`/admin/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, note: "Updated from the order status dropdown", force: true }) });
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
        <div><p className="eyebrow">SALES</p><h1>Manage Orders</h1><p className="muted">Review customer orders and update their status.</p></div>
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
      {pendingCancelOrder && <DeleteConfirmDialog
        title={`Cancel order #${pendingCancelOrder.orderNumber}?`}
        message="This order will be cancelled and its reserved stock released."
        confirmLabel="Yes, Cancel"
        errorFallback="The order could not be cancelled."
        onCancel={() => setPendingCancelOrder(null)}
        onConfirm={async () => { await changeTableStatus(pendingCancelOrder, "cancelled", true); }}
      />}
      {openId && <OrderDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
