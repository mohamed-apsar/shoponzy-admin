import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "../api/adminApi";
import "./StockNotifications.css";

// Uses the inventory API so product-specific alert levels match the inventory page.
/* eslint-disable react/prop-types */
export default function StockNotifications({ page, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const result = await adminRequest("/admin/inventory?stockStatus=low&sort=stock_low&page=1&limit=5", { cache: "no-store" });
      if (request !== requestRef.current) return;
      setItems(result.data);
      setTotal(result.meta.total);
      setError("");
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

  return <div className="stock-notifications" ref={rootRef}>
    <button ref={buttonRef} type="button" className="icon-button stock-notifications-trigger" aria-label={`Notifications${total ? `: ${total} low-stock variants` : ""}`} aria-expanded={open} aria-controls="stock-notifications-panel" onClick={() => setOpen((value) => !value)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {total > 0 && <span className="stock-notifications-count">{total > 99 ? "99+" : total}</span>}
      {error && <span className="stock-notifications-warning" aria-label="Alerts unavailable">!</span>}
    </button>
    {open && <section id="stock-notifications-panel" className="stock-notifications-panel" aria-label="Stock notifications">
      <div className="stock-notifications-heading"><div><strong>Stock notifications</strong><p>Products that need restocking</p></div><button type="button" aria-label="Close notifications" onClick={() => { setOpen(false); buttonRef.current?.focus(); }}>×</button></div>
      {error ? <div className="stock-notifications-message" role="alert"><p>{error}</p><button type="button" onClick={refresh}>Try again</button></div> : loading ? <p className="stock-notifications-message" role="status">Loading stock alerts…</p> : total === 0 ? <p className="stock-notifications-message">No low-stock alerts. Your inventory is above its alert levels.</p> : <>
        <p className="stock-notifications-summary" role="status">{total} {total === 1 ? "variant needs" : "variants need"} attention</p>
        <ul>{items.map((item) => <li key={`${item.productId}-${item.variantId}`}><div><strong>{item.name}</strong><span>{item.variantLabel || item.sku || "Default variant"}</span></div><div className="stock-notifications-level"><strong>{item.stock} left</strong><span>Alert level: {item.threshold}</span></div></li>)}</ul>
        <button type="button" className="stock-notifications-view" onClick={() => { setOpen(false); onNavigate("Low-Stock Alerts"); }}>View all low-stock alerts →</button>
      </>}
    </section>}
  </div>;
}
