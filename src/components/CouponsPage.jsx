import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "../api/adminApi";
import { money, shortDate } from "../utils/format";
import EditIcon from "./EditIcon";
import StatusToggle from "./StatusToggle";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { Pagination } from "./ops/OpsKit";

/* eslint-disable react/prop-types */
const emptyCoupon = () => ({
  code: "", description: "", type: "percent", value: "", minSubtotal: "0", maxDiscount: "",
  startsAt: "", endsAt: "", usageLimit: "", perUserLimit: "", status: "active",
});

const dateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : "");
const ruleText = (c) => `${c.type === "percent" ? `${c.value}% off` : `${money(c.value)} off`}${c.minSubtotal ? ` on ${money(c.minSubtotal)}+` : ""}${c.maxDiscount ? ` (max ${money(c.maxDiscount)})` : ""}`;

function couponState(c) {
  const now = new Date();
  if (c.status !== "active") return ["Disabled", "disabled"];
  if (c.endsAt && new Date(c.endsAt) < now) return ["Expired", "disabled"];
  if (c.usageLimit && c.usedCount >= c.usageLimit) return ["Used up", "disabled"];
  if (c.startsAt && new Date(c.startsAt) > now) return ["Scheduled", "disabled"];
  return ["Active", "enabled"];
}

export default function CouponsPage({ query = "" }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(emptyCoupon);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingStatusIds, setPendingStatusIds] = useState([]);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (query.trim()) params.set("q", query.trim());
      const result = await adminRequest(`/admin/coupons?${params}`);
      setItems(result.data);
      setMeta(result.meta || { total: result.data.length, pages: 1 });
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => { setPage(1); }, [query]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  function openAdd() {
    setEditingId(null);
    setForm(emptyCoupon());
    setError("");
    setShowForm(true);
  }

  function openEdit(c) {
    setEditingId(c.id);
    setForm({
      code: c.code, description: c.description || "", type: c.type, value: String(c.value), minSubtotal: String(c.minSubtotal || 0),
      maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", startsAt: dateInput(c.startsAt), endsAt: dateInput(c.endsAt),
      usageLimit: c.usageLimit ? String(c.usageLimit) : "", perUserLimit: c.perUserLimit ? String(c.perUserLimit) : "", status: c.status,
    });
    setError("");
    setShowForm(true);
  }

  async function save(event) {
    event.preventDefault();
    setError("");
    const num = (v) => (v === "" ? null : Number(v));
    const payload = {
      code: form.code.trim().toUpperCase(), description: form.description.trim(), type: form.type,
      value: Number(form.value), minSubtotal: Number(form.minSubtotal || 0),
      maxDiscount: form.type === "percent" ? num(form.maxDiscount) : null,
      startsAt: form.startsAt || null, endsAt: form.endsAt ? `${form.endsAt}T23:59:59` : null,
      usageLimit: num(form.usageLimit), perUserLimit: num(form.perUserLimit), status: form.status,
    };
    if (!/^[A-Z0-9_-]{3,30}$/.test(payload.code)) return setError("Code: 3–30 letters, numbers, - or _.");
    if (!(payload.value > 0)) return setError("Enter a discount value greater than 0.");
    setSaving(true);
    try {
      if (editingId) await adminRequest(`/admin/coupons/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await adminRequest("/admin/coupons", { method: "POST", body: JSON.stringify(payload) });
      setShowForm(false);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c) {
    const nextStatus = c.status === "active" ? "disabled" : "active";
    setItems((current) => current.map((item) => item.id === c.id ? { ...item, status: nextStatus } : item));
    setPendingStatusIds((current) => [...current, c.id]);
    setLoadError("");
    try {
      await adminRequest(`/admin/coupons/${c.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
    } catch (requestError) {
      setItems((current) => current.map((item) => item.id === c.id ? { ...item, status: c.status } : item));
      setLoadError(requestError.message);
    } finally {
      setPendingStatusIds((current) => current.filter((id) => id !== c.id));
    }
  }

  async function remove(c) {
    setDeleting(c);
  }

  async function confirmDelete() {
    await adminRequest(`/admin/coupons/${deleting.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">MARKETING</p><h1>Coupons</h1><p className="muted">Discount codes shoppers can apply in their bag. Totals are re-checked when the order is placed.</p></div>
        <button className="primary-button" onClick={openAdd}>+ Add Coupon</button>
      </div>
      <section className="panel table-panel">
        <div className="product-toolbar"><div><h2>All Coupons</h2><p className="muted">{loading ? "Loading…" : `${meta.total ?? items.length} coupons`}</p></div></div>
        {loadError && <div className="products-form-error" role="alert">{loadError}</div>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Valid</th><th>Used</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((c) => {
                const [label, tone] = couponState(c);
                return (
                  <tr key={c.id}>
                    <td className="order-id">{c.code}{c.description ? <><br /><small className="muted">{c.description}</small></> : null}</td>
                    <td>{ruleText(c)}</td>
                    <td>{c.startsAt || c.endsAt ? `${c.startsAt ? shortDate(c.startsAt) : "Now"} – ${c.endsAt ? shortDate(c.endsAt) : "No end"}` : "Always"}</td>
                    <td>{c.usedCount || 0}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                    <td><span className={`products-status ${tone}`}>{label}</span></td>
                    <td><div className="action-buttons">
                      <button className="table-action edit-icon-button" aria-label={`Edit coupon ${c.code}`} title={`Edit coupon ${c.code}`} onClick={() => openEdit(c)}><EditIcon /></button>
                      <StatusToggle checked={c.status === "active"} label={`${c.status === "active" ? "Disable" : "Enable"} coupon ${c.code}`} onChange={() => toggle(c)} disabled={pendingStatusIds.includes(c.id)} />
                      <button className="table-action danger" onClick={() => remove(c)}>Delete</button>
                    </div></td>
                  </tr>
                );
              })}
              {!items.length && !loading && <tr><td colSpan={6} className="empty-state">No coupons yet. Click Add Coupon to create one.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination meta={meta} page={page} onPage={setPage} />
      </section>

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="coupon-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-heading">
              <div><p className="eyebrow">COUPON</p><h2 id="coupon-title">{editingId ? "Edit Coupon" : "Add Coupon"}</h2></div>
              <button type="button" className="close-button" onClick={() => setShowForm(false)} aria-label="Close form">×</button>
            </div>
            {error && <div className="products-form-error" role="alert">{error}</div>}
            <form onSubmit={save}>
              <div className="products-form-grid">
                <label className="products-form-field">Coupon Code *
                  <input required value={form.code} onChange={(e) => update("code", e.target.value.toUpperCase())} placeholder="e.g. DIWALI15" style={{ textTransform: "uppercase" }} />
                </label>
                <label className="products-form-field">Description (shown to shoppers)
                  <input value={form.description} maxLength={120} onChange={(e) => update("description", e.target.value)} placeholder="e.g. 15% off on ₹1,999+" />
                </label>
                <label className="products-form-field">Discount Type
                  <select value={form.type} onChange={(e) => update("type", e.target.value)}>
                    <option value="percent">Percentage (%)</option><option value="fixed">Fixed amount (₹)</option>
                  </select>
                </label>
                <label className="products-form-field">{form.type === "percent" ? "Percentage Off * (max 90)" : "Amount Off (₹) *"}
                  <input required type="number" min="0.01" max={form.type === "percent" ? 90 : undefined} step="0.01" value={form.value} onChange={(e) => update("value", e.target.value)} />
                </label>
                <label className="products-form-field">Minimum Bag Value (₹)
                  <input type="number" min="0" step="1" value={form.minSubtotal} onChange={(e) => update("minSubtotal", e.target.value)} />
                </label>
                {form.type === "percent" && (
                  <label className="products-form-field">Maximum Discount (₹, optional)
                    <input type="number" min="1" step="1" value={form.maxDiscount} onChange={(e) => update("maxDiscount", e.target.value)} />
                  </label>
                )}
                <label className="products-form-field">Start Date
                  <input type="date" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} />
                </label>
                <label className="products-form-field">End Date (inclusive)
                  <input type="date" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} />
                </label>
                <label className="products-form-field">Total Uses Allowed (optional)
                  <input type="number" min="1" step="1" value={form.usageLimit} onChange={(e) => update("usageLimit", e.target.value)} />
                </label>
                <label className="products-form-field">Uses Per Customer (optional)
                  <input type="number" min="1" step="1" value={form.perUserLimit} onChange={(e) => update("perUserLimit", e.target.value)} />
                </label>
                <label className="products-form-field">Status
                  <select value={form.status} onChange={(e) => update("status", e.target.value)}>
                    <option value="active">Active</option><option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>
              <p className="form-hint">Per-customer limits are counted by account and by the phone number used at checkout.</p>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Coupon"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {deleting && <DeleteConfirmDialog title="Delete coupon?" message={`Coupon ${deleting.code} will be deleted. Past orders keep their discount.`} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
    </>
  );
}
