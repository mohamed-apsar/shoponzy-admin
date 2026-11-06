import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { adminRequest } from "../../api/adminApi";
import { titleCase } from "../../utils/format";
import "./ops.css";

/* eslint-disable react/prop-types, react-refresh/only-export-components */
/* Shared building blocks for the Inventory, Transactions and Returns sections. */

/* ---------- Toasts ---------- */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="ops-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ops-toast ${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
            <span>{t.tone === "error" ? "!" : "✓"}</span>{t.message}
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Modal & confirmation ---------- */
// Open modals, innermost last: Escape closes only the top one (a confirmation over a detail view).
const modalStack = [];
export function Modal({ title, eyebrow, onClose, children, footer, wide = false, busy = false }) {
  const self = useRef({});
  useEffect(() => {
    const me = self.current;
    modalStack.push(me);
    return () => { modalStack.splice(modalStack.indexOf(me), 1); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !busy && modalStack[modalStack.length - 1] === self.current) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="modal-backdrop ops-backdrop" onClick={() => !busy && onClose()}>
      <section className={`product-modal ops-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div>
          <button type="button" className="close-button" onClick={onClose} disabled={busy} aria-label="Close">×</button>
        </div>
        <div className="ops-modal-body">{children}</div>
        {footer && <div className="modal-actions ops-modal-footer">{footer}</div>}
      </section>
    </div>
  );
}

/* Confirmation step for actions that change data. `onConfirm` may throw; the error is shown in the dialog. */
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", tone = "primary", onConfirm, onClose, children, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title={title} eyebrow="PLEASE CONFIRM" onClose={onClose} busy={busy} footer={<>
      <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={tone === "danger" ? "ops-danger-button" : "primary-button"} onClick={confirm} disabled={busy || disabled}>{busy ? "Saving…" : confirmLabel}</button>
    </>}>
      {message && <p className="ops-confirm-text">{message}</p>}
      {children}
      {error && <div className="products-form-error" role="alert">{error}</div>}
    </Modal>
  );
}

/* ---------- Layout pieces ---------- */
export function PageHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="page-heading ops-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>
      {actions && <div className="ops-heading-actions">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange, label }) {
  return (
    <div className="ops-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={`ops-tab ${active === t.id ? "active" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}{t.count !== undefined && t.count !== null && <span className="ops-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatCards({ items, loading }) {
  return (
    <div className="ops-stats">
      {items.map((s) => (
        <section key={s.label} className={`stat-card ops-stat ${s.tone || ""}`}>
          <p className="muted">{s.label}</p>
          {loading ? <span className="ops-skeleton ops-skeleton-value" /> : <h2>{s.value}</h2>}
          {s.note && <span className="ops-stat-note">{s.note}</span>}
        </section>
      ))}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="ops-error" role="alert">
      <span>{error}</span>
      {onRetry && <button type="button" className="table-action" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function SkeletonRows({ columns, rows = 6 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={`sk${r}`} className="ops-skeleton-row" aria-hidden="true">
      {Array.from({ length: columns }, (_, c) => <td key={c}><span className="ops-skeleton" style={{ width: `${45 + ((r * 7 + c * 13) % 45)}%` }} /></td>)}
    </tr>
  ));
}

export function EmptyRow({ columns, title = "Nothing here yet", hint }) {
  return (
    <tr><td colSpan={columns} className="ops-empty">
      <div className="ops-empty-icon">∅</div><strong>{title}</strong>{hint && <p className="muted">{hint}</p>}
    </td></tr>
  );
}

/* Table body that handles loading / empty states. */
export function TableBody({ loading, items, columns, empty, emptyHint, children }) {
  if (loading && !items.length) return <tbody><SkeletonRows columns={columns} /></tbody>;
  if (!items.length) return <tbody><EmptyRow columns={columns} title={empty} hint={emptyHint} /></tbody>;
  return <tbody className={loading ? "ops-refreshing" : ""}>{children}</tbody>;
}

export function Pagination({ meta, page, onPage }) {
  if (!meta || (meta.pages || 1) <= 1) return meta?.total ? <div className="ops-pagination"><span className="muted">{meta.total} result{meta.total === 1 ? "" : "s"}</span></div> : null;
  return (
    <div className="ops-pagination">
      <span className="muted">{meta.total} results · page {page} of {meta.pages}</span>
      <div>
        <button type="button" className="table-action" disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page">«</button>
        <button type="button" className="table-action" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
        <button type="button" className="table-action" disabled={page >= meta.pages} onClick={() => onPage(page + 1)}>Next ›</button>
        <button type="button" className="table-action" disabled={page >= meta.pages} onClick={() => onPage(meta.pages)} aria-label="Last page">»</button>
      </div>
    </div>
  );
}

const TONES = {
  success: "green", in: "green", captured: "green", processed: "green", completed: "green", approved: "indigo", received: "indigo", inspected: "indigo",
  low: "amber", pending: "amber", processing: "amber", requested: "amber", pickup_scheduled: "blue", in_transit: "blue", partially_refunded: "blue", refunded: "slate",
  out: "red", failed: "red", rejected: "red", cancelled: "slate", inactive: "slate", not_applicable: "slate",
};
const LABELS = { in: "In stock", low: "Low stock", out: "Out of stock", success: "Success", not_applicable: "Not applicable", processed: "Completed", cod: "COD" };
export function Badge({ value, label }) {
  if (!value) return <span className="muted">—</span>;
  return <span className={`ops-badge ${TONES[value] || "slate"}`}>{label || LABELS[value] || titleCase(value)}</span>;
}

export function Thumb({ src, alt = "" }) {
  return src ? <img className="ops-thumb" src={src} alt={alt} loading="lazy" /> : <span className="ops-thumb ops-thumb-empty" aria-hidden="true">□</span>;
}

export function Field({ label, children, full = false, hint }) {
  return <label className={`ops-field ${full ? "full" : ""}`}><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>;
}

export function KeyValues({ rows }) {
  return (
    <dl className="ops-kv">
      {rows.filter(Boolean).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? "—"}</dd></div>)}
    </dl>
  );
}

/* ---------- Data loading ---------- */
/* Loads `path` (re-run when it changes), debounced; keeps the last good data while refreshing. */
export function useAdminData(path, { debounce = 200, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: Boolean(enabled && path), error: "" });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path || !enabled) return;
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const result = await adminRequest(path);
      if (n === seq.current) setState({ data: result.data, meta: result.meta || null, loading: false, error: "" });
    } catch (e) {
      if (n === seq.current) setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [path, enabled]);
  useEffect(() => {
    const t = setTimeout(load, debounce);
    return () => clearTimeout(t);
  }, [load, debounce]);
  return { ...state, reload: load };
}

export const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};

/* "YYYY-MM-DD" from a date input → ISO start of that day in the admin's time zone. */
export const dayStart = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : "");
export const dayEnd = (d) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : "");
