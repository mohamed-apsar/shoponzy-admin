import { useEffect, useMemo, useRef, useState } from "react";
import { adminRequest } from "../api/adminApi";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import StatusToggle from "./StatusToggle";
import "./ShippingPage.css";

const empty = { states: [], pincodes: [] };
const cardStyle = { background: "var(--surface, #fff)", border: "1px solid var(--border, #e2e7f0)", borderRadius: 16, padding: 24, minWidth: 0 };
const rowStyle = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const inputStyle = { minWidth: 0, flex: 1, height: 48, border: "1px solid #d9e0ed", borderRadius: 10, padding: "0 14px", background: "var(--surface, #fff)", color: "inherit", font: "inherit" };
const btnStyle = { border: 0, borderRadius: 10, padding: "12px 18px", background: "#0e9367", color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryStyle = { border: "1px solid #d9e0ed", borderRadius: 9, padding: "7px 11px", background: "transparent", color: "inherit", cursor: "pointer" };
const norm = (s) => String(s || "").trim().toLocaleLowerCase();

/* eslint-disable react/prop-types */
export default function ShippingPage() {
  const editDialogRef = useRef(null);
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editValues, setEditValues] = useState({ name: "", code: "", price: "" });
  const [editError, setEditError] = useState("");
  const [stateName, setStateName] = useState("");
  const [districtDrafts, setDistrictDrafts] = useState({});
  const [form, setForm] = useState({ state: "", district: "", code: "", price: "" });
  const states = data.states || [];
  const districts = useMemo(() => states.find((s) => s.name === form.state)?.districts || [], [states, form.state]);

  useEffect(() => {
    let active = true;
    adminRequest("/admin/site-settings").then((result) => {
      if (active) setData(result.data.shipping || empty);
    }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!editTarget) return;
    const dialog = editDialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [editTarget]);

  async function save(next, message = "Shipping settings saved.") {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await adminRequest("/admin/site-settings/shipping", { method: "PATCH", body: JSON.stringify(next) });
      setData(result.data); setNotice(message);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  const updateState = (index, update) => save({ ...data, states: states.map((s, i) => i === index ? { ...s, ...update } : s) });
  const updateDistrict = (si, di, update) => save({ ...data, states: states.map((s, i) => i === si ? { ...s, districts: s.districts.map((d, j) => j === di ? { ...d, ...update } : d) } : s) });
  const updateRate = (index, update) => save({ ...data, pincodes: data.pincodes.map((p, i) => i === index ? { ...p, ...update } : p) });

  function addState(event) {
    event.preventDefault(); const name = stateName.trim();
    if (!name || states.some((s) => norm(s.name) === norm(name))) return setError("Enter a unique state name.");
    setStateName(""); save({ ...data, states: [...states, { name: name.toLocaleUpperCase(), enabled: true, districts: [] }] }, "State added.");
  }
  function openEdit(target) {
    setEditError("");
    setError("");
    setEditValues({ name: target.name || "", code: target.code || "", price: target.price == null ? "" : String(target.price) });
    setEditTarget(target);
  }
  function renameState(index) {
    openEdit({ type: "state", si: index, name: states[index].name });
  }
  function addDistrict(event, index) {
    event.preventDefault(); const name = String(districtDrafts[index] || "").trim(); const current = states[index];
    if (!name || current.districts.some((d) => norm(d.name) === norm(name))) return setError("Enter a unique district name.");
    setDistrictDrafts((v) => ({ ...v, [index]: "" }));
    save({ ...data, states: states.map((s, i) => i === index ? { ...s, districts: [...s.districts, { name: name.toLocaleUpperCase(), enabled: true }] } : s) }, "District added.");
  }
  function renameDistrict(si, di) {
    openEdit({ type: "district", si, di, name: states[si].districts[di].name });
  }
  function addPin(event) {
    event.preventDefault(); const code = form.code.trim(); const price = Number(form.price);
    if (!/^\d{6}$/.test(code)) return setError("Enter a valid 6-digit PIN code.");
    if (data.pincodes.some((p) => p.code === code)) return setError("That PIN code already has a delivery rate.");
    if (!form.state || !form.district || form.price === "" || !Number.isFinite(price) || price < 0) return setError("Select a state and district and enter a valid shipping price.");
    setForm((v) => ({ ...v, code: "", price: "" }));
    save({ ...data, pincodes: [...data.pincodes, { code, state: form.state, district: form.district, price, enabled: true }] }, "PIN code delivery rate added.");
  }
  function editRate(index) {
    const old = data.pincodes[index];
    openEdit({ type: "pincode", index, code: old.code, price: old.price });
  }
  async function saveEdit(event) {
    event.preventDefault();
    if (!editTarget || saving) return;
    setEditError("");
    let next = data;
    let message = "Shipping details updated.";
    if (editTarget.type === "state") {
      const name = editValues.name.trim();
      if (!name) return setEditError("Enter a state name.");
      if (states.some((state, index) => index !== editTarget.si && norm(state.name) === norm(name))) return setEditError("That state already exists.");
      const current = states[editTarget.si];
      const normalizedName = name.toLocaleUpperCase();
      next = {
        ...data,
        states: states.map((state, index) => index === editTarget.si ? { ...state, name: normalizedName } : state),
        pincodes: data.pincodes.map((pin) => pin.state === current.name ? { ...pin, state: normalizedName } : pin),
      };
      message = "State updated.";
    } else if (editTarget.type === "district") {
      const name = editValues.name.trim();
      const state = states[editTarget.si];
      const current = state.districts[editTarget.di];
      if (!name) return setEditError("Enter a district name.");
      if (state.districts.some((district, index) => index !== editTarget.di && norm(district.name) === norm(name))) return setEditError("That district already exists in this state.");
      const normalizedName = name.toLocaleUpperCase();
      next = {
        ...data,
        states: states.map((item, index) => index === editTarget.si ? { ...item, districts: item.districts.map((district, districtIndex) => districtIndex === editTarget.di ? { ...district, name: normalizedName } : district) } : item),
        pincodes: data.pincodes.map((pin) => pin.state === state.name && pin.district === current.name ? { ...pin, district: normalizedName } : pin),
      };
      message = "District updated.";
    } else {
      const code = editValues.code.trim();
      const price = Number(editValues.price);
      if (!/^\d{6}$/.test(code)) return setEditError("Enter a valid 6-digit PIN code.");
      if (data.pincodes.some((pin, index) => index !== editTarget.index && pin.code === code)) return setEditError("That PIN code already has a delivery rate.");
      if (editValues.price === "" || !Number.isFinite(price) || price < 0) return setEditError("Enter a valid non-negative shipping price.");
      next = { ...data, pincodes: data.pincodes.map((pin, index) => index === editTarget.index ? { ...pin, code, price } : pin) };
      message = "PIN code delivery rate updated.";
    }

    setSaving(true);
    try {
      const result = await adminRequest("/admin/site-settings/shipping", { method: "PATCH", body: JSON.stringify(next) });
      setData(result.data);
      setNotice(message);
      setEditTarget(null);
      setError("");
    } catch (saveError) {
      setEditError(saveError.message);
    } finally {
      setSaving(false);
    }
  }
  function removeDistrict(si, di) {
    const state = states[si]; const district = state.districts[di];
    setDeleteTarget({ type: "district", si, di, name: district.name, state: state.name });
  }
  async function confirmDelete() {
    let next; let message;
    if (deleteTarget.type === "state") {
      next = { ...data, states: states.filter((_, i) => i !== deleteTarget.si), pincodes: data.pincodes.filter((p) => p.state !== deleteTarget.name) };
      message = "State and delivery rates deleted.";
    } else if (deleteTarget.type === "district") {
      next = { ...data, states: states.map((s, i) => i === deleteTarget.si ? { ...s, districts: s.districts.filter((_, j) => j !== deleteTarget.di) } : s), pincodes: data.pincodes.filter((p) => !(p.state === deleteTarget.state && p.district === deleteTarget.name)) };
      message = "District and its PIN code rates deleted.";
    } else {
      next = { ...data, pincodes: data.pincodes.filter((_, i) => i !== deleteTarget.index) };
      message = "PIN code delivery rate deleted.";
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await adminRequest("/admin/site-settings/shipping", { method: "PATCH", body: JSON.stringify(next) });
      setData(result.data); setNotice(message); setDeleteTarget(null);
    } catch (e) { setError(e.message); throw e; }
    finally { setSaving(false); }
  }

  return <section className="shipping-page">
    <div style={{ marginBottom: 24 }}><p className="eyebrow">DELIVERY</p><h1 style={{ margin: "0 0 8px" }}>Pincode &amp; shipping</h1><p className="muted">Configure workspace delivery coverage and a shipping price for each Indian PIN code.</p></div>
    {error && <div role="alert" className="ops-error" style={{ marginBottom: 16 }}>{error}<button type="button" style={{ ...secondaryStyle, float: "right" }} onClick={() => setError("")}>Dismiss</button></div>}
    {notice && <p role="status" className="ops-success">{notice}</p>}
    {loading ? <p className="muted">Loading shipping settings…</p> : <>
      <div className="shipping-grid">
        <section style={cardStyle}>
          <h2>Add a state and districts</h2>
          <form onSubmit={addState} style={{ marginBottom: 20 }}><label className="shipping-label">State name <b>*</b></label><div style={rowStyle}><input style={inputStyle} value={stateName} onChange={(e) => setStateName(e.target.value)} required aria-label="State name" /><button style={btnStyle} disabled={saving}>＋ Add state</button></div></form>
          <div className="shipping-state-list">{states.map((state, si) => <article className="shipping-state" key={`${state.name}-${si}`}>
            <div style={rowStyle}><h3 style={{ margin: "0 auto 0 0" }}>{state.name}</h3><StatusToggle checked={state.enabled} label={`${state.enabled ? "Disable" : "Enable"} ${state.name}`} statusText={state.enabled ? "Enabled" : "Disabled"} disabled={saving} onChange={() => updateState(si, { enabled: !state.enabled })} /><button type="button" style={secondaryStyle} aria-label={`Edit ${state.name}`} onClick={() => renameState(si)}>✎</button><button type="button" className="shipping-delete" onClick={() => setDeleteTarget({ type: "state", si, name: state.name })}>Delete</button></div>
            <form onSubmit={(e) => addDistrict(e, si)} style={{ ...rowStyle, margin: "14px 0 10px" }}><input style={inputStyle} placeholder="District name" aria-label={`District name for ${state.name}`} value={districtDrafts[si] || ""} onChange={(e) => setDistrictDrafts((v) => ({ ...v, [si]: e.target.value }))} /><button type="submit" style={secondaryStyle} disabled={saving}>＋ District</button></form>
            <div className="shipping-chips">{state.districts.map((district, di) => <div className="shipping-chip" key={`${district.name}-${di}`}><strong>{district.name}</strong><StatusToggle checked={district.enabled} label={`${district.enabled ? "Disable" : "Enable"} ${district.name}`} statusText={district.enabled ? "Enabled" : "Disabled"} disabled={saving} onChange={() => updateDistrict(si, di, { enabled: !district.enabled })} /><button type="button" onClick={() => renameDistrict(si, di)}>Edit</button><button type="button" className="shipping-delete" onClick={() => removeDistrict(si, di)}>Delete</button></div>)}</div>
          </article>)}</div>
          {!states.length && <p className="muted">Add a state to start configuring delivery coverage.</p>}
        </section>
        <section style={cardStyle}>
          <h2>Add a PIN code and delivery price</h2>
          <form onSubmit={addPin}>
            <label className="shipping-label">State <b>*</b></label><select style={{ ...inputStyle, width: "100%", marginBottom: 14 }} value={form.state} required onChange={(e) => setForm({ ...form, state: e.target.value, district: "" })}><option value="">Choose state</option>{states.filter((s) => s.enabled).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select>
            <label className="shipping-label">District <b>*</b></label><select style={{ ...inputStyle, width: "100%", marginBottom: 14 }} value={form.district} required disabled={!form.state} onChange={(e) => setForm({ ...form, district: e.target.value })}><option value="">Choose district</option>{districts.filter((d) => d.enabled).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select>
            <div className="shipping-fields"><label className="shipping-label">6-digit PIN code <b>*</b><input style={{ ...inputStyle, width: "100%", marginTop: 8 }} value={form.code} inputMode="numeric" maxLength={6} pattern="[0-9]{6}" required onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} /></label><label className="shipping-label">Shipping price (₹) <b>*</b><input style={{ ...inputStyle, width: "100%", marginTop: 8 }} type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label></div>
            <button type="submit" style={{ ...btnStyle, marginTop: 16 }} disabled={saving || !form.state || !form.district}>＋ Add PIN code</button>
          </form>
        </section>
      </div>
      <section style={{ ...cardStyle, marginTop: 24 }}><h2>⌖ PIN code delivery rates</h2>
        {!data.pincodes.length ? <p className="muted">No PIN code rates yet.</p> : <div className="shipping-rate-list">{data.pincodes.map((rate, i) => <div className="shipping-rate" key={`${rate.code}-${i}`}><div><strong>{rate.code}</strong><p>{rate.district}, {rate.state} · ₹{Number(rate.price).toLocaleString("en-IN")}</p></div><div style={rowStyle}><StatusToggle checked={rate.enabled} label={`${rate.enabled ? "Disable" : "Enable"} PIN code ${rate.code}`} statusText={rate.enabled ? "Enabled" : "Disabled"} disabled={saving} onChange={() => updateRate(i, { enabled: !rate.enabled })} /><button type="button" style={secondaryStyle} aria-label={`Edit rate for ${rate.code}`} onClick={() => editRate(i)}>✎</button><button type="button" className="shipping-delete" onClick={() => setDeleteTarget({ type: "pincode", index: i, name: rate.code })}>Delete</button></div></div>)}</div>}
      </section>
      {saving && <p role="status" className="muted">Saving changes…</p>}
    </>}
    {editTarget && <dialog ref={editDialogRef} className="shipping-edit-dialog" aria-labelledby="shipping-edit-title" aria-describedby="shipping-edit-description" onCancel={(event) => { event.preventDefault(); if (!saving) setEditTarget(null); }} onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (!saving && event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) setEditTarget(null);
    }}>
        <div className="shipping-edit-heading">
          <div><p className="shipping-edit-eyebrow">SHIPPING SETTINGS</p><h2 id="shipping-edit-title">Edit {editTarget.type === "pincode" ? "PIN code delivery rate" : editTarget.type}</h2><p id="shipping-edit-description">Update the delivery information saved for your store.</p></div>
          <button type="button" className="shipping-edit-close" aria-label="Close edit dialog" disabled={saving} onClick={() => setEditTarget(null)}>×</button>
        </div>
        <form onSubmit={saveEdit} aria-busy={saving}>
          <fieldset className="shipping-edit-inputs" disabled={saving}>
          {editTarget.type !== "pincode" ? <label className="shipping-edit-field">{editTarget.type === "state" ? "State name" : "District name"}<input required aria-describedby={editError ? "shipping-edit-error" : undefined} autoFocus maxLength={80} value={editValues.name} onChange={(event) => setEditValues((values) => ({ ...values, name: event.target.value }))} placeholder={editTarget.type === "state" ? "Enter state name" : "Enter district name"} /></label> : <div className="shipping-edit-fields">
            <label className="shipping-edit-field">6-digit PIN code<input required aria-describedby={editError ? "shipping-edit-error" : undefined} autoFocus inputMode="numeric" maxLength={6} pattern="[0-9]{6}" value={editValues.code} onChange={(event) => setEditValues((values) => ({ ...values, code: event.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="e.g. 625007" /></label>
            <label className="shipping-edit-field">Shipping price (₹)<input required aria-describedby={editError ? "shipping-edit-error" : undefined} type="number" min="0" step="0.01" value={editValues.price} onChange={(event) => setEditValues((values) => ({ ...values, price: event.target.value }))} placeholder="0.00" /></label>
          </div>}
          </fieldset>
          {editError && <p id="shipping-edit-error" className="shipping-edit-error" role="alert">{editError}</p>}
          <div className="shipping-edit-actions"><button type="button" className="shipping-edit-cancel" disabled={saving} onClick={() => setEditTarget(null)}>Cancel</button><button type="submit" className="shipping-edit-save" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
        </form>
    </dialog>}
    {deleteTarget && <DeleteConfirmDialog title={deleteTarget.type === "pincode" ? "Delete PIN code rate?" : `Delete ${deleteTarget.type}?`} message={deleteTarget.type === "state" ? `“${deleteTarget.name}” and all its districts and PIN code rates will be deleted.` : deleteTarget.type === "district" ? `“${deleteTarget.name}” and its PIN code rates will be deleted.` : `The delivery rate for PIN code ${deleteTarget.name} will be deleted.`} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
  </section>;
}
