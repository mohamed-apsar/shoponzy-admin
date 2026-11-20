import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "../api/adminApi";
import OrderActivity from "./OrderActivity";
import "./StockNotifications.css";

const ACTIVITY_SEEN_KEY = "shoponzy:admin-order-activity-seen";

// Uses the inventory API so product-specific alert levels match the inventory page.
/* eslint-disable react/prop-types */
export default function StockNotifications({ page, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState({ cancellations: [], returns: [], total: 0, cancelledCount: 0, returnCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [seenThrough, setSeenThrough] = useState(() => Number(sessionStorage.getItem(ACTIVITY_SEEN_KEY)) || 0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const [stockResult, orderResult] = await Promise.allSettled([
        adminRequest("/admin/inventory?stockStatus=low&sort=stock_low&page=1&limit=5", { cache: "no-store" }),
        adminRequest("/admin/order-alerts", { cache: "no-store" }),
      ]);
      if (request !== requestRef.current) return;
      if (stockResult.status === "fulfilled") {
        setItems(stockResult.value.data);
        setTotal(stockResult.value.meta.total);
        setError("");
      } else setError(stockResult.reason.message || "Unable to load stock alerts.");
      if (orderResult.status === "fulfilled") {
        setActions(orderResult.value.data);
        setActionError("");
      } else setActionError(orderResult.reason.message || "Unable to load order and return alerts.");
    } catch (failure) {
      if (request === requestRef.current) setError(failure.message || "Unable to load stock alerts.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestState = requestRef;
    refresh();
    const timer = window.setInterval(refresh, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("admin:data-changed", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ++requestState.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("admin:data-changed", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, page]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const outside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => {
      if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, refresh]);

  const viewAlerts = () => { setOpen(false); onNavigate("Low-Stock Alerts"); };
  const openAction = (target, search) => { setOpen(false); onNavigate(target, search); };
  async function reviewCancellation(id) {
    try {
      await adminRequest(`/admin/orders/${id}/review-cancellation`, { method: "PATCH" });
      await refresh();
    } catch (failure) { setActionError(failure.message || "Could not mark cancellation reviewed."); }
  }
  const unreadActivity = actions.activity?.filter((event) => Date.parse(event.at) > seenThrough).length || 0;
  const notificationCount = total + actions.total + unreadActivity;
  function markActivityRead() {
    const latest = Date.parse(actions.activity?.[0]?.at);
    if (!Number.isFinite(latest)) return;
    sessionStorage.setItem(ACTIVITY_SEEN_KEY, String(latest));
    setSeenThrough(latest);
  }
  const bell = <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
  return <div className="stock-notifications" ref={rootRef}>
    <button ref={buttonRef} type="button" className={"icon-button stock-notifications-trigger" + (open ? " is-open" : "")} aria-label={`Notifications: ${unreadActivity} unread order updates, ${actions.total} orders and returns requiring review, ${total} inventory alerts`} aria-expanded={open} aria-controls={open ? "stock-notifications-panel" : undefined} onClick={() => setOpen((value) => !value)}>
      {bell}
      {notificationCount > 0 && <span className="stock-notifications-count">{notificationCount > 99 ? "99+" : notificationCount}</span>}
      {(error || actionError) && <span className="stock-notifications-warning" aria-label="Some alerts unavailable">!</span>}
    </button>
    {open && <section id="stock-notifications-panel" className="stock-notifications-panel" aria-label="Order, return and stock notifications">
      <div className="stock-notifications-heading">
        <span className="stock-notifications-heading-icon">{bell}</span>
        <div><h2>Notifications</h2><p>Order activity and inventory alerts</p></div>
        <button type="button" className="stock-notifications-close" aria-label="Close notifications" onClick={() => { setOpen(false); buttonRef.current?.focus(); }}>?</button>
      </div>
      {!loading && <div className="order-action-alerts">
        <button type="button" className="order-action-reviewed" onClick={() => openAction("Order & Return Alerts")}>View order & return alerts</button>
        {actionError && <p role="alert">{actionError} <button type="button" className="order-action-reviewed" onClick={refresh}>Try again</button></p>}
        <div className="order-activity-heading">
          <h3>Recent order activity</h3>
          {!actionError && unreadActivity > 0 && <button type="button" className="order-action-reviewed" onClick={markActivityRead}>Mark activity as read</button>}
        </div>
        {!actionError && <OrderActivity items={actions.activity?.slice(0, 6)} onOpen={openAction} />}
        <h3>Cancelled orders ({actions.cancelledCount})</h3>
        {!actionError && actions.cancellations.length === 0 && <p>No cancellations awaiting review.</p>}
        {actions.cancellations.map((item) => <div className="order-action-alert" key={item.id}>
          <button type="button" className="stock-notifications-item" onClick={() => openAction("Manage Orders", item.orderNumber)}><span className="stock-notifications-product"><strong>{item.orderNumber} · {item.customer}</strong><span>{item.message}</span></span></button>
          <button type="button" className="order-action-reviewed" onClick={() => reviewCancellation(item.id)}>Mark reviewed</button>
        </div>)}
        {actions.cancelledCount > actions.cancellations.length && <p>Showing the latest {actions.cancellations.length}; more appear after review.</p>}
        <h3>Return requests ({actions.returnCount})</h3>
        {!actionError && actions.returns.length === 0 && <p>No return requests awaiting review.</p>}
        {actions.returns.map((item) => <button type="button" className="stock-notifications-item" key={item.id} onClick={() => openAction("Return Requests")}><span className="stock-notifications-product"><strong>{item.returnNumber} · {item.orderNumber}</strong><span>{item.customer} · {item.message}</span><span>Review return request</span></span></button>)}
        {actions.returnCount > actions.returns.length && <button type="button" className="order-action-reviewed" onClick={() => openAction("Return Requests")}>View all return requests</button>}
      </div>}
      <div className="stock-notifications-toolbar"><span>Inventory alerts <b>{error || loading ? "?" : total}</b></span><span className="stock-notifications-live"><span />Auto-updating</span></div>
      {error ? <div className="stock-notifications-message" role="alert"><span className="stock-notifications-state-icon is-error" aria-hidden="true">!</span><h3>Could not load notifications</h3><p>{error}</p><button type="button" onClick={refresh}>Try again</button></div>
        : loading ? <div className="stock-notifications-loading" role="status"><span className="stock-notifications-sr">Loading stock alerts?</span>{[1, 2, 3].map((key) => <div className="stock-notifications-skeleton" key={key} aria-hidden="true"><span /><div><i /><i /></div></div>)}</div>
        : total === 0 ? <div className="stock-notifications-message"><span className="stock-notifications-state-icon" aria-hidden="true">?</span><h3>Your inventory looks healthy</h3><p>No low-stock alerts right now. Items will appear here when they reach their alert level.</p></div>
        : <>
          <div className="stock-notifications-summary" role="status"><span className="stock-notifications-summary-icon" aria-hidden="true">!</span><div><strong>{total} {total === 1 ? "variant needs" : "variants need"} restocking</strong><p>Review these items before they sell out.</p></div></div>
          <ul>{items.map((item) => <li key={item.productId + "-" + item.variantId}>
            <button type="button" className="stock-notifications-item" onClick={viewAlerts}>
              <span className="stock-notifications-product-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5v4" /></svg></span>
              <span className="stock-notifications-product"><strong>{item.name}</strong><span>{item.variantLabel || item.sku || "Default variant"}</span><span className="stock-notifications-threshold">Alert level: {item.threshold} units</span></span>
              <span className="stock-notifications-level"><b>{item.stock} left</b><span>Low stock</span></span>
            </button>
          </li>)}</ul>
        </>}
      <div className="stock-notifications-footer">{!error && !loading && total > items.length && <p>Showing {items.length} of {total} alerts</p>}<button type="button" className="stock-notifications-view" onClick={viewAlerts}>View inventory alerts <span aria-hidden="true">?</span></button><span>Stock levels refresh automatically</span></div>
    </section>}
  </div>;
}
