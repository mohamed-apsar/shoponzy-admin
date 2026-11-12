import { Fragment, useEffect, useState } from "react";
import "./CategoryManager.css";
import { adminRequest, uploadImage } from "../api/adminApi";
import EditIcon from "./EditIcon";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

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
  const [statusOverrides, setStatusOverrides] = useState({});
  const [pendingStatusIds, setPendingStatusIds] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [expandedProducts, setExpandedProducts] = useState(null);
  const [productsByCategory, setProductsByCategory] = useState({});
  const [newInImage, setNewInImage] = useState(null);
  const [newInImageBusy, setNewInImageBusy] = useState(false);
  const [newInImageError, setNewInImageError] = useState("");
  const [imageChanged, setImageChanged] = useState(false);
  const [exploreImageChanged, setExploreImageChanged] = useState(false);
  const [bannerImageChanged, setBannerImageChanged] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", brand: "", parentIds: ["","","",""], image: null, bannerImage: null, status: "enabled" });

  useEffect(() => {
    if (level !== 1) return undefined;
    let active = true;
    adminRequest("/admin/site-settings")
      .then((result) => { if (active) setNewInImage(result.data.homeCategories?.newInImage || null); })
      .catch((requestError) => { if (active) setNewInImageError(requestError.message); });
    return () => { active = false; };
  }, [level]);

  async function uploadNewInImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setNewInImageError("Choose a PNG, JPG, WebP or GIF image.");
      return;
    }
    setNewInImageBusy(true);
    setNewInImageError("");
    try {
      const upload = await uploadImage(file, "category");
      const image = { url: upload.url, publicId: upload.publicId, alt: "New In" };
      const result = await adminRequest("/admin/site-settings/homeCategories", { method: "PATCH", body: JSON.stringify({ newInImage: image }) });
      setNewInImage(result.data.newInImage || image);
    } catch (requestError) {
      setNewInImageError(requestError.message);
    } finally {
      setNewInImageBusy(false);
    }
  }

  async function removeNewInImage() {
    setNewInImageBusy(true);
    setNewInImageError("");
    try {
      await adminRequest("/admin/site-settings/homeCategories", { method: "PATCH", body: JSON.stringify({ newInImage: null }) });
      setNewInImage(null);
    } catch (requestError) {
      setNewInImageError(requestError.message);
    } finally {
      setNewInImageBusy(false);
    }
  }

  const visible = categories.filter((item) => item.level === level).map((item) => ({
    ...item,
    status: statusOverrides[item.id] ?? item.status,
    tableImage: level === 2 || level === 3 ? item.productImage || item.image : item.image,
  }));
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
    setImageChanged(false);
    setExploreImageChanged(false);
    setBannerImageChanged(false);
    setForm({ name: "", slug: "", brand: "", parentIds: ["","","",""], image: null, bannerImage: null, exploreImage: null, status: "enabled" });
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
    setImageChanged(false);
    setExploreImageChanged(false);
    setBannerImageChanged(false);
    setForm({ name: item.name, slug: item.slug, brand: item.brand || "", parentIds, image: item.image || null, bannerImage: item.bannerImage || null, exploreImage: item.exploreImage || null, status: item.status });
    setError("");
    setShowForm(true);
  }

  async function onImageChange(event, field) {
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
      setForm((previous) => ({ ...previous, [`${field}Preview`]: preview }));
      const result = await uploadImage(file, field === "bannerImage" ? "categoryBanner" : "category");
      setForm((previous) => ({
        ...previous,
        [field]: {
          url: result.url,
          publicId: result.publicId,
          alt: field === "exploreImage" ? `${previous.name} Shop all card background` : field === "bannerImage" ? `${previous.name} category banner` : previous.name,
        },
      }));
      if (field === "image") setImageChanged(true);
      if (field === "exploreImage") setExploreImageChanged(true);
      if (field === "bannerImage") setBannerImageChanged(true);
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
      ...(level === 2 ? { brand: form.brand.trim() } : {}),
      ...(level === 1 || imageChanged ? { image: form.image } : {}),
      ...(level === 1 && exploreImageChanged ? { exploreImage: form.exploreImage || null } : {}),
      ...(level === 1 && bannerImageChanged ? { bannerImage: form.bannerImage || null } : {}),
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
    setDeleting(item);
  }

  async function toggleStatus(item) {
    const nextStatus = item.status === "enabled" ? "disabled" : "enabled";
    setStatusOverrides((current) => ({ ...current, [item.id]: nextStatus }));
    setPendingStatusIds((current) => [...current, item.id]);
    setError("");
    try {
      await onToggleStatus(item.id, nextStatus);
    } catch (statusError) {
      setStatusOverrides((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setError(statusError.message);
    } finally {
      setPendingStatusIds((current) => current.filter((id) => id !== item.id));
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

  async function loadCategoryProducts(item) {
    setProductsByCategory((current) => ({ ...current, [item.id]: { loading: true, data: [] } }));
    try {
      const params = new URLSearchParams({ category: item.id, page: "1", limit: "100" });
      const result = await adminRequest(`/admin/products?${params}`);
      setProductsByCategory((current) => ({ ...current, [item.id]: { loading: false, data: result.data || [], total: result.meta?.total || 0 } }));
    } catch (requestError) {
      setProductsByCategory((current) => ({ ...current, [item.id]: { loading: false, data: [], error: requestError.message } }));
    }
  }

  async function toggleProducts(item) {
    if (expandedProducts === item.id) {
      setExpandedProducts(null);
      return;
    }
    setExpandedProducts(item.id);
    if (!productsByCategory[item.id]) await loadCategoryProducts(item);
  }

  async function retryProducts(item) {
    setExpandedProducts(item.id);
    await loadCategoryProducts(item);
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
        <div><h1>{config.title}</h1><p>Manage category names, artwork, parent relationships and status.</p></div>
        <button className="cm-primary-btn" onClick={openAdd} disabled={loading}>＋ Add</button>
      </div>

      {level === 1 && <section className="cm-panel" style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <h2 style={{ margin: "0 0 6px" }}>New In circle image</h2>
          <p style={{ margin: 0, color: "#68738b" }}>Upload the image shown in the New In shortcut on the storefront.</p>
          {newInImageError && <p className="cm-error" role="alert">{newInImageError}</p>}
        </div>
        {newInImage?.url && <img src={newInImage.url} alt="New In shortcut preview" style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", border: "1px solid #e3e7ef" }} />}
        <label className="cm-primary-btn" style={{ display: "inline-flex", alignItems: "center", cursor: newInImageBusy ? "wait" : "pointer", opacity: newInImageBusy ? .65 : 1 }}>
          {newInImageBusy ? "Uploading…" : newInImage ? "Replace image" : "Upload image"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadNewInImage} disabled={newInImageBusy} style={{ display: "none" }} />
        </label>
        {newInImage?.url && <button type="button" className="cm-primary-btn" onClick={removeNewInImage} disabled={newInImageBusy}>Remove image</button>}
      </section>}

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
            <thead><tr>{level <= 3 && <th>Image</th>}<th>Name</th><th>Slug</th>{level > 1 && <th>Parent path</th>}<th>Products</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {shown.map((item) => (
                <Fragment key={item.id}>
                <tr>
                  {level <= 3 && <td>{item.tableImage?.url ? <img className="cm-thumb" src={item.tableImage.url} alt={item.name} loading="lazy" /> : <div className="cm-thumb cm-thumb-empty">No image</div>}</td>}
                  <td>{item.name}</td><td>{item.slug}</td>{level > 1 && <td>{pathFor(item) || "—"}</td>}
                  <td><button type="button" className="cm-products-toggle" aria-expanded={expandedProducts === item.id} onClick={() => toggleProducts(item)}>
                    {expandedProducts === item.id ? "Hide" : "View"} products ({item.productCount || 0})
                  </button></td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.status === "enabled"}
                      aria-label={`${item.status === "enabled" ? "Disable" : "Enable"} ${item.name}`}
                      title={`${item.status === "enabled" ? "Disable" : "Enable"} ${item.name}`}
                      className={`cm-status-toggle ${item.status}`}
                      onClick={() => toggleStatus(item)}
                      disabled={loading || pendingStatusIds.includes(item.id)}
                    >
                      <span className="cm-toggle-track" aria-hidden="true"><span /></span>
                      <span>{item.status === "enabled" ? "Enabled" : "Disabled"}</span>
                    </button>
                  </td>
                  <td><div className="cm-actions"><button type="button" className="cm-edit-icon-button" aria-label={`Edit ${item.name}`} title={`Edit ${item.name}`} onClick={() => openEdit(item)}><EditIcon /></button><button className="danger" onClick={() => remove(item)}>Delete</button></div></td>
                </tr>
                {expandedProducts === item.id && <tr key={`${item.id}-products`} className="cm-products-row">
                  <td colSpan={(level <= 3 ? 1 : 0) + 2 + (level > 1 ? 1 : 0) + 3}>
                    {productsByCategory[item.id]?.loading ? <span role="status">Loading products…</span>
                      : productsByCategory[item.id]?.error ? <span className="cm-products-error">{productsByCategory[item.id].error} <button type="button" onClick={() => retryProducts(item)}>Retry</button></span>
                        : productsByCategory[item.id]?.data?.length ? <>
                          <div className="cm-products-list">{productsByCategory[item.id].data.map((product) => <div className="cm-product-entry" key={product.id}>
                            <strong>{product.name}</strong><span>{product.sku || product.variants?.[0]?.sku || "No product code"}</span><span>{product.status === "active" ? "Enabled" : product.status}</span>
                          </div>)}</div>
                          {productsByCategory[item.id].total > productsByCategory[item.id].data.length && <p className="cm-products-more">Showing {productsByCategory[item.id].data.length} of {productsByCategory[item.id].total} products.</p>}
                        </>
                          : <span>No products in this category or its subcategories.</span>}
                  </td>
                </tr>}
                </Fragment>
              ))}
              {!loading && !shown.length && <tr><td colSpan={(level <= 3 ? 1 : 0) + 2 + (level > 1 ? 1 : 0) + 3} className="cm-empty">No {config.title.toLowerCase()} found.</td></tr>}
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
            {level === 2 && <div className="cm-form-group"><label htmlFor="subcategory-brand">Brand for products (optional)</label><input id="subcategory-brand" value={form.brand} maxLength={80} placeholder="Enter brand name" onChange={(e) => setForm((previous) => ({ ...previous, brand: e.target.value }))} /></div>}
            <div className="cm-form-group"><label>Slug *</label><input required value={form.slug} placeholder="Enter Slug" onChange={(e) => setForm((previous) => ({ ...previous, slug: slugify(e.target.value) }))} /></div>
            {level <= 2 && <div className="cm-form-group">
              <label htmlFor="category-strip-image">{level === 1 ? "Category strip image" : `${config.singular} circular image`}</label>
              <p className="cm-image-help">Shown in the circular {level === 1 ? "category" : "subcategory"} link on the storefront.</p>
              <input id="category-strip-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => onImageChange(event, "image")} />
              {(form.imagePreview || form.image?.url) && <div className="cm-category-image-preview">
                <img className={`cm-image-preview${level > 1 ? " cm-circle-image-preview" : ""}`} src={form.imagePreview || form.image.url} alt={`${form.name || config.singular} circular image preview`} />
                <button type="button" className="cm-secondary-btn" onClick={() => {
                  setForm((previous) => ({ ...previous, image: null, imagePreview: "" }));
                  setImageChanged(true);
                }}>Remove image</button>
              </div>}
            </div>}
            {level >= 3 && <p className="cm-image-help" role="note">
              Add actual products in Manage Products, upload each product&apos;s images there, and select this as the deepest category. They will appear under the parent subcategory on the storefront.
            </p>}
            {level === 1 && <>
              <div className="cm-form-group">
                <label htmlFor="category-banner-image">Category page banner</label>
                <p className="cm-image-help">Shown behind the title on this category’s storefront page. Upload a wide image.</p>
                <input id="category-banner-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => onImageChange(event, "bannerImage")} />
                {(form.bannerImagePreview || form.bannerImage?.url) && <div className="cm-explore-image-preview cm-banner-image-preview">
                  <img src={form.bannerImagePreview || form.bannerImage.url} alt={`${form.name || "Category"} banner preview`} />
                  <button type="button" className="cm-secondary-btn" onClick={() => {
                    setForm((previous) => ({ ...previous, bannerImage: null, bannerImagePreview: "" }));
                    setBannerImageChanged(true);
                  }}>Remove image</button>
                </div>}
              </div>
              <div className="cm-form-group cm-explore-image-field">
                <label htmlFor="category-explore-image">Shop all card background image</label>
                <p className="cm-image-help">Shown behind “Shop all {form.name || "category"}” in the top navigation dropdown. Upload a wide image; the card text stays overlaid.</p>
                <input id="category-explore-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => onImageChange(event, "exploreImage")} />
                {(form.exploreImagePreview || form.exploreImage?.url) && <div className="cm-explore-image-preview">
                  <img src={form.exploreImagePreview || form.exploreImage.url} alt={`${form.name || "Category"} Shop all card background preview`} />
                  <span>Preview: Shop all {form.name || "category"}</span>
                  <button type="button" className="cm-secondary-btn" onClick={() => {
                    setForm((previous) => ({ ...previous, exploreImage: null, exploreImagePreview: "" }));
                    setExploreImageChanged(true);
                  }}>Remove image</button>
                </div>}
              </div>
            </>}
            <div className="cm-form-group"><label>Status</label><select value={form.status} onChange={(e) => setForm((previous) => ({ ...previous, status: e.target.value }))}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
            {error && <p className="cm-error">{error}</p>}
            <div className="cm-modal-actions"><button type="button" className="cm-secondary-btn" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button><button type="submit" className="cm-primary-btn" disabled={saving}>{saving ? "Saving…" : "Submit"}</button></div>
          </form>
        </section>
      </div>}
      {deleting && <DeleteConfirmDialog title={`Delete ${config.singular}?`} message={`“${deleting.name}” will be permanently deleted.`} onCancel={() => setDeleting(null)} onConfirm={() => onDelete(deleting.id)} />}
    </div>
  );
}
