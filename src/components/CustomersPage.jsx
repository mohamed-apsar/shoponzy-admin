import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "../api/adminApi";
import { money, shortDate } from "../utils/format";
import { OrdersTable } from "./OrdersPage";
import { ExportButton } from "./ops/OpsKit";

/* eslint-disable react/prop-types */
const PAGE_SIZE = 20;

function CustomerDetail({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => adminRequest(`/admin/users/${id}`).then((r) => setData(r.data)).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function toggle() {
    const next = data.user.status === "active" ? "disabled" : "active";
    if (next === "disabled" && !window.confirm("Disable this customer? They are signed out everywhere immediately.")) return;
    setBusy(true);
    try {
      await adminRequest(`/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      await load();
      onChanged();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const user = data?.user;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="customer-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div><p className="eyebrow">CUSTOMER</p><h2 id="customer-title">{user?.name || "Loading…"}</h2></div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        {error && <div className="products-form-error" role="alert">{error}</div>}
        {user && (
          <>
            <div className="products-form-grid">
              <div className="products-form-field"><span>Email</span><div>{user.email}</div></div>
              <div className="products-form-field"><span>Phone</span><div>{user.phone || "—"}</div></div>
              <div className="products-form-field"><span>Joined</span><div>{shortDate(user.createdAt)}</div></div>
              <div className="products-form-field"><span>Status</span><div><span className={`products-status ${user.status === "active" ? "enabled" : "disabled"}`}>{user.status}</span></div></div>
              <div className="products-form-field"><span>Orders</span><div>{data.stats.orders}</div></div>
              <div className="products-form-field"><span>Total spent</span><div>{money(data.stats.totalSpent)}</div></div>
            </div>
            {!!user.addresses?.length && (
              <div style={{ marginTop: 16 }}><h3>Addresses</h3>
                <ul className="muted">{user.addresses.map((a) => <li key={a.id || a._id}>{a.label}: {a.name}, {a.line1}, {a.city}, {a.state} {a.pincode} · {a.phone}</li>)}</ul>
              </div>
            )}
            <h3 style={{ marginTop: 16 }}>Order history</h3>
            <OrdersTable items={data.orders} />
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Close</button>
              <button type="button" className="primary-button" disabled={busy} onClick={toggle}>{user.status === "active" ? "Disable customer" : "Enable customer"}</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function CustomersPage({ query = "" }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const term = `${search} ${query}`.trim();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (term) params.set("q", term);
      if (status) params.set("status", status);
      const result = await adminRequest(`/admin/users?${params}`);
      setItems(result.data);
      setMeta(result.meta || {});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [page, term, status]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => { setPage(1); }, [term, status]);

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">CUSTOMERS</p><h1>Customer List</h1><p className="muted">Customers who created an account on the storefront. Guest orders appear under Manage Orders.</p></div>
      </div>
      <section className="panel table-panel">
        <div className="product-toolbar">
          <div><h2>All Customers</h2><p className="muted">{loading ? "Loading…" : `${meta.total ?? items.length} customers`}</p></div>
          <div className="products-filter-controls">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone..." aria-label="Search customers" />
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
              <option value="">All Statuses</option><option value="active">Active</option><option value="disabled">Disabled</option>
            </select>
            <ExportButton path={`/admin/users/export.csv?${new URLSearchParams(Object.entries({ q: term, status }).filter(([, v]) => v))}`} filename="shoponzy-customers" disabled={!meta.total} />
          </div>
        </div>
        {error && <div className="products-form-error" role="alert">{error}</div>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td><td>{user.email}</td><td>{user.phone || "—"}</td><td>{shortDate(user.createdAt)}</td>
                  <td><span className={`products-status ${user.status === "active" ? "enabled" : "disabled"}`}>{user.status}</span></td>
                  <td><button className="table-action" onClick={() => setOpenId(user.id)}>View</button></td>
                </tr>
              ))}
              {!items.length && !loading && <tr><td colSpan={6} className="empty-state">No customers found.</td></tr>}
            </tbody>
          </table>
        </div>
        {(meta.pages || 1) > 1 && (
          <div className="action-buttons" style={{ justifyContent: "flex-end", padding: "12px 0" }}>
            <button className="table-action" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Prev</button>
            <span className="muted">Page {page} of {meta.pages}</span>
            <button className="table-action" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
          </div>
        )}
      </section>
      {openId && <CustomerDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
