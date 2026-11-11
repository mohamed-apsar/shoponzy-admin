import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "../api/adminApi";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

const empty = { states: [], pincodes: [] };
const cardStyle = { background: "var(--surface, #fff)", border: "1px solid var(--border, #e2e7f0)", borderRadius: 16, padding: 24, minWidth: 0 };
const rowStyle = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const inputStyle = { minWidth: 0, flex: 1, height: 48, border: "1px solid #d9e0ed", borderRadius: 10, padding: "0 14px", background: "var(--surface, #fff)", color: "inherit", font: "inherit" };
const btnStyle = { border: 0, borderRadius: 10, padding: "12px 18px", background: "#0e9367", color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryStyle = { border: "1px solid #d9e0ed", borderRadius: 9, padding: "7px 11px", background: "transparent", color: "inherit", cursor: "pointer" };
const norm = (s) => String(s || "").trim().toLocaleLowerCase();

/* eslint-disable react/prop-types */
export default function ShippingPage() {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
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
  function renameState(index) {
    const current = states[index]; const name = window.prompt("Edit state name", current.name)?.trim();
    if (!name || name === current.name) return;
    if (states.some((s, i) => i !== index && norm(s.name) === norm(name))) return setError("That state already exists.");
    const old = current.name;
    save({ ...data, states: states.map((s, i) => i === index ? { ...s, name: name.toLocaleUpperCase() } : s), pincodes: data.pincodes.map((p) => p.state === old ? { ...p, state: name.toLocaleUpperCase() } : p) });
  }
  function addDistrict(event, index) {
    event.preventDefault(); const name = String(districtDrafts[index] || "").trim(); const current = states[index];
    if (!name || current.districts.some((d) => norm(d.name) === norm(name))) return setError("Enter a unique district name.");
    setDistrictDrafts((v) => ({ ...v, [index]: "" }));
    save({ ...data, states: states.map((s, i) => i === index ? { ...s, districts: [...s.districts, { name: name.toLocaleUpperCase(), enabled: true }] } : s) }, "District added.");
  }
  function renameDistrict(si, di) {
    const old = states[si].districts[di]; const name = window.prompt("Edit district name", old.name)?.trim();
    if (!name || name === old.name) return;
    if (states[si].districts.some((d, i) => i !== di && norm(d.name) === norm(name))) return setError("That district already exists in this state.");
    const stateName = states[si].name;
    save({ ...data, states: states.map((s, i) => i === si ? { ...s, districts: s.districts.map((d, j) => j === di ? { ...d, name: name.toLocaleUpperCase() } : d) } : s), pincodes: data.pincodes.map((p) => p.state === stateName && p.district === old.name ? { ...p, district: name.toLocaleUpperCase() } : p) });
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
    const code = window.prompt("Edit 6-digit PIN code", old.code)?.trim(); if (code == null) return;
    const priceText = window.prompt("Edit shipping price (₹)", String(old.price)); if (priceText == null) return;
    const price = Number(priceText);
    if (!/^\d{6}$/.test(code) || !Number.isFinite(price) || price < 0 || data.pincodes.some((p, i) => i !== index && p.code === code)) return setError("Enter a unique 6-digit PIN and a valid non-negative price.");
    updateRate(index, { code, price });
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
            <div style={rowStyle}><h3 style={{ margin: "0 auto 0 0" }}>{state.name}</h3><label className="shipping-toggle"><input type="checkbox" checked={state.enabled} disabled={saving} onChange={(e) => updateState(si, { enabled: e.target.checked })} /> Enabled</label><button type="button" style={secondaryStyle} aria-label={`Edit ${state.name}`} onClick={() => renameState(si)}>✎</button><button type="button" className="shipping-delete" onClick={() => setDeleteTarget({ type: "state", si, name: state.name })}>Delete</button></div>
            <form onSubmit={(e) => addDistrict(e, si)} style={{ ...rowStyle, margin: "14px 0 10px" }}><input style={inputStyle} placeholder="District name" aria-label={`District name for ${state.name}`} value={districtDrafts[si] || ""} onChange={(e) => setDistrictDrafts((v) => ({ ...v, [si]: e.target.value }))} /><button type="submit" style={secondaryStyle} disabled={saving}>＋ District</button></form>
            <div className="shipping-chips">{state.districts.map((district, di) => <div className="shipping-chip" key={`${district.name}-${di}`}><strong>{district.name}</strong><button type="button" onClick={() => updateDistrict(si, di, { enabled: !district.enabled })}>{district.enabled ? "Disable" : "Enable"}</button><button type="button" onClick={() => renameDistrict(si, di)}>Edit</button><button type="button" className="shipping-delete" onClick={() => removeDistrict(si, di)}>Delete</button></div>)}</div>
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
        {!data.pincodes.length ? <p className="muted">No PIN code rates yet.</p> : <div className="shipping-rate-list">{data.pincodes.map((rate, i) => <div className="shipping-rate" key={`${rate.code}-${i}`}><div><strong>{rate.code}</strong><p>{rate.district}, {rate.state} · ₹{Number(rate.price).toLocaleString("en-IN")}</p></div><div style={rowStyle}><label className="shipping-toggle"><input type="checkbox" checked={rate.enabled} disabled={saving} onChange={(e) => updateRate(i, { enabled: e.target.checked })} /> Enabled</label><button type="button" style={secondaryStyle} aria-label={`Edit rate for ${rate.code}`} onClick={() => editRate(i)}>✎</button><button type="button" className="shipping-delete" onClick={() => setDeleteTarget({ type: "pincode", index: i, name: rate.code })}>Delete</button></div></div>)}</div>}
      </section>
      {saving && <p role="status" className="muted">Saving changes…</p>}
    </>}
    {deleteTarget && <DeleteConfirmDialog title={deleteTarget.type === "pincode" ? "Delete PIN code rate?" : `Delete ${deleteTarget.type}?`} message={deleteTarget.type === "state" ? `“${deleteTarget.name}” and all its districts and PIN code rates will be deleted.` : deleteTarget.type === "district" ? `“${deleteTarget.name}” and its PIN code rates will be deleted.` : `The delivery rate for PIN code ${deleteTarget.name} will be deleted.`} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
  </section>;
}
