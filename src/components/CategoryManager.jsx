import { useState } from "react";
import "./CategoryManager.css";
import { adminRequest } from "../api/adminApi";
import EditIcon from "./EditIcon";

/* eslint-disable react/prop-types */
const LEVELS = [
  { title: "Categories", singular: "Category" },
  { title: "Sub categories", singular: "Subcategory" },
  { title: "Child categories", singular: "Child category" },
  { title: "Child Second categories", singular: "Second child category" },
  { title: "Child Third categories", singular: "Third child category" },
];

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CategoryManager({ categories, mode = 1, loading = false, loadError = "", onSave, onDelete, onToggleStatus }) {
  const level = Number(mode);
  const config = LEVELS[level - 1] || LEVELS[0];
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState("10");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", parentIds: ["","","",""], image: null, status: "enabled" });

  const visible = categories.filter((item) => item.level === level);
  const filtered = visible.filter((item) => {
    const parent = categories.find((p) => p.id === item.parentId);
    const term = `${item.name} ${item.slug} ${parent?.name || ""}`.toLowerCase();
    return term.includes(search.toLowerCase()) && (statusFilter === "all" || item.status === statusFilter);
  });
  const shown = pageSize === "all" ? filtered : filtered.slice(0, Number(pageSize));

  function parentForLevel(childLevel) {
    if (childLevel === 1) return null;
    return form.parentIds[childLevel - 2] || "";
  }

  function parentOptions(parentLevel, parentId) {
    return categories.filter((item) => item.level === parentLevel && item.status === "enabled" &&
      (parentLevel === 1 || item.parentId === parentId));
  }

  function openAdd() {
    setEditingId(null);
    setForm({ name: "", slug: "", parentIds: ["","","",""], image: null, status: "enabled" });
    setError("");
    setShowForm(true);
  }

  function openEdit(item) {
    const parentIds = ["","","",""];
    let parentId = item.parentId;
    for (let parentLevel = level - 1; parentLevel >= 1; parentLevel--) {
      parentIds[parentLevel - 1] = parentId || "";
      const parent = categories.find((entry) => entry.id === parentId);
      parentId = parent?.parentId || null;
    }
    setEditingId(item.id);
    setForm({ name: item.name, slug: item.slug, parentIds, image: item.image || null, status: item.status });
    setError("");
    setShowForm(true);
  }

  async function onImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      event.target.value = "";
      return;
    }

    setSaving(true);
    setError("");
    try {
      const preview = await readImage(file);
      setForm((previous) => ({ ...previous, imagePreview: preview }));
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "category");
      const result = await adminRequest("/admin/uploads", { method: "POST", body });
      setForm((previous) => ({
        ...previous,
        image: { url: result.data.url, publicId: result.data.publicId, alt: previous.name },
      }));
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setSaving(false);
      event.target.value = "";
    }
  }

  async function save(event) {
    event.preventDefault();
    const name = form.name.trim();
    const slug = form.slug.trim() || slugify(name);
    if (!name || !slug) return setError("Name and slug are required.");
    const parentId = level === 1 ? null : parentForLevel(level);
    if (level > 1 && !parentId) return setError(`Select a ${LEVELS[level - 2].singular.toLowerCase()}.`);
    const duplicate = categories.some((item) => item.level === level && item.parentId === parentId &&
      item.slug.toLowerCase() === slug.toLowerCase() && item.id !== editingId);
    if (duplicate) return setError("That slug already exists under this parent.");

    const payload = {
      name,
      slug,
      parent: parentId,
      status: form.status,
      ...(level === 1 || form.image ? { image: form.image } : {}),
    };
    setSaving(true);
    setError("");
    try {
      await onSave(editingId, payload);
      setShowForm(false);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    const hasDescendants = categories.some((entry) => {
      let p = entry.parentId;
      while (p) {
        if (p === item.id) return true;
        p = categories.find((candidate) => candidate.id === p)?.parentId;
      }
      return false;
    });
    if (hasDescendants) return alert("Delete this item's child categories first.");
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    setError("");
    try {
      await onDelete(item.id);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function toggleStatus(item) {
    setError("");
    try {
      await onToggleStatus(item.id, item.status === "enabled" ? "disabled" : "enabled");
    } catch (statusError) {
      setError(statusError.message);
    }
  }

  function pathFor(item) {
    const names = [];
    let p = item.parentId;
    while (p) {
      const parent = categories.find((entry) => entry.id === p);
      if (!parent) break;
      names.unshift(parent.name);
      p = parent.parentId;
    }
    return names.join(" / ");
  }

  const parentFields = Array.from({ length: Math.max(0, level - 1) }, (_, index) => {
    const parentLevel = index + 1;
    const parentId = parentLevel === 1 ? null : form.parentIds[parentLevel - 2];
    return {
      parentLevel,
      value: form.parentIds[index],
      options: parentOptions(parentLevel, parentId),
    };
  });

  return (
    <div className="cm-page">
      <div className="cm-heading">
        <div><h1>{config.title}</h1><p>Manage category names, slugs, parent relationships and status.</p></div>
        <button className="cm-primary-btn" onClick={openAdd} disabled={loading}>＋ Add</button>
      </div>

      <section className="cm-panel">
        {error && <p className="cm-error" role="alert">{error}</p>}
        {loadError && <p className="cm-error" role="alert">{loadError} <button type="button" onClick={() => window.location.reload()}>Reload</button></p>}
        {loading && <p role="status">Loading categories from the database…</p>}
        <div className="cm-toolbar">
          <label className="cm-page-size">Show
            <select value={pageSize} onChange={(e) => setPageSize(e.target.value)}>
              <option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="all">All</option>
            </select> entries
          </label>
          <div className="cm-search-row">
            <label>Search: <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." /></label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
              <option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead><tr>{level === 1 && <th>Image</th>}<th>Name</th><th>Slug</th>{level > 1 && <th>Parent path</th>}<th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  {level === 1 && <td>{item.image?.url ? <img className="cm-thumb" src={item.image.url} alt={item.name} /> : <div className="cm-thumb cm-thumb-empty">No image</div>}</td>}
                  <td>{item.name}</td><td>{item.slug}</td>{level > 1 && <td>{pathFor(item) || "—"}</td>}
                  <td><button className={`cm-status-button ${item.status}`} onClick={() => toggleStatus(item)} disabled={loading}>{item.status === "enabled" ? "Enabled ▾" : "Disabled ▾"}</button></td>
                  <td><div className="cm-actions"><button type="button" className="cm-edit-icon-button" aria-label={`Edit ${item.name}`} title={`Edit ${item.name}`} onClick={() => openEdit(item)}><EditIcon /></button><button className="danger" onClick={() => remove(item)}>Delete</button></div></td>
                </tr>
              ))}
              {!loading && !shown.length && <tr><td colSpan={level === 1 ? 5 : 5} className="cm-empty">No {config.title.toLowerCase()} found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="cm-table-footer">Showing {shown.length} of {filtered.length} entries</div>
      </section>

      {showForm && <div className="cm-modal-overlay" onClick={() => setShowForm(false)}>
        <section className="cm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <div className="cm-modal-header"><h2>{editingId ? "Edit" : "Create"} {config.singular}</h2><button className="cm-close" type="button" onClick={() => setShowForm(false)}>×</button></div>
          <form onSubmit={save}>
            {parentFields.map(({ parentLevel, value, options }) => (
              <div className="cm-form-group" key={parentLevel}>
                <label>{LEVELS[parentLevel - 1].singular} *</label>
                <select required value={value} onChange={(e) => setForm((previous) => {
                  const parentIds = [...previous.parentIds];
                  parentIds[parentLevel - 1] = e.target.value;
                  for (let i = parentLevel; i < parentIds.length; i++) parentIds[i] = "";
                  return { ...previous, parentIds };
                })}>
                  <option value="">Select One</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              </div>
            ))}
            <div className="cm-form-group"><label>Name *</label><input required value={form.name} placeholder="Enter Name" onChange={(e) => {
              const name = e.target.value;
              setForm((previous) => ({ ...previous, name, slug: editingId ? previous.slug : slugify(name) }));
            }} /></div>
            <div className="cm-form-group"><label>Slug *</label><input required value={form.slug} placeholder="Enter Slug" onChange={(e) => setForm((previous) => ({ ...previous, slug: slugify(e.target.value) }))} /></div>
            {level === 1 &&             <div className="cm-form-group"><label>Category Image</label><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={onImageChange} />{(form.imagePreview || form.image?.url) && <img className="cm-image-preview" src={form.imagePreview || form.image.url} alt="Category preview" />}<small>Images are uploaded to the configured image service.</small></div>}
            <div className="cm-form-group"><label>Status</label><select value={form.status} onChange={(e) => setForm((previous) => ({ ...previous, status: e.target.value }))}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
            {error && <p className="cm-error">{error}</p>}
            <div className="cm-modal-actions"><button type="button" className="cm-secondary-btn" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button><button type="submit" className="cm-primary-btn" disabled={saving}>{saving ? "Saving…" : "Submit"}</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}
