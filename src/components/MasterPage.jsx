import { useEffect, useState } from "react";
import { adminRequest } from "../api/adminApi";
import { PageHeading } from "./ops/OpsKit";

export default function MasterPage() {
  const [badges, setBadges] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await adminRequest("/admin/product-badges");
      setBadges(result.data.badges || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveList(next) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await adminRequest("/admin/product-badges", {
        method: "PUT",
        body: JSON.stringify({ badges: next }),
      });
      setBadges(result.data.badges || []);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addBadge(event) {
    event.preventDefault();
    const value = name.trim();
    setError("");
    setSuccess("");
    if (!value) return setError("Enter a badge name.");
    if (badges.some((badge) => badge.toLowerCase() === value.toLowerCase())) return setError("That badge already exists.");
    if (badges.length >= 30) return setError("You can create up to 30 badges.");
    if (await saveList([...badges, value])) {
      setName("");
      setSuccess(`“${value}” is ready to use on products.`);
    }
  }

  async function removeBadge(value) {
    if (await saveList(badges.filter((badge) => badge !== value))) setSuccess(`“${value}” was removed.`);
  }

  return <>
    <PageHeading eyebrow="MASTER DATA" title="Master" description="Create and manage the product badges available when adding or editing products." />
    <section className="panel table-panel">
      <div className="product-toolbar">
        <div><h2>Product badges</h2><p className="muted">Badges created here appear in the product form and on the storefront.</p></div>
      </div>
      <form onSubmit={addBadge} style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12, margin: "18px 0 22px" }}>
        <label className="products-form-field" style={{ flex: "1 1 280px", maxWidth: 520 }}>Badge name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="e.g. Limited Edition" disabled={saving} />
        </label>
        <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Create badge"}</button>
      </form>
      {error && <div className="products-form-error" role="alert">{error}<button type="button" className="table-action" onClick={load} disabled={loading}>Retry</button></div>}
      {success && <p className="ms-valid" role="status">{success}</p>}
      {loading ? <p className="muted">Loading badges…</p> : badges.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {badges.map((badge) => <div key={badge} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", border: "1px solid var(--shoponzy-border, #e5e7eb)", borderRadius: 10, background: "#fff" }}>
            <span className="ops-badge indigo">{badge}</span>
            <button type="button" className="table-action danger" onClick={() => removeBadge(badge)} disabled={saving} aria-label={`Remove ${badge} badge`}>Remove</button>
          </div>)}
        </div>
      ) : <div className="ops-empty"><strong>No badges yet</strong><p>Create a badge to add it to products.</p></div>}
    </section>
  </>;
}
