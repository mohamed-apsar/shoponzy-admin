import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest, uploadImage } from "../api/adminApi";
import { money } from "../utils/format";
import EditIcon from "./EditIcon";
import StatusToggle from "./StatusToggle";

/* eslint-disable react/prop-types */
const LEVEL_LABELS = ["Select Category *", "Select Sub Category", "Select Child Category", "Select Second Child Category", "Select Third Child Category"];
const productBrands = ["Unbranded", "Nike", "Adidas", "Puma", "Levi's", "Ray-Ban", "Calvin Klein", "Other"];
const FLAGS = [
  ["isNewArrival", "New Arrivals"],
  ["isBestseller", "Bestseller"],
  ["isTrending", "Trending"],
  ["isFeatured", "Featured"],
];
const BADGES = ["", "Bestseller", "Trending", "New Drop"];
const PAGE_SIZE = 20;

const emptyForm = () => ({
  name: "", sku: "", brand: "", description: "", status: "active",
  categoryIds: ["", "", "", "", ""],
  images: [],
  colors: [], sizesText: "",
  price: "", mrp: "", stock: "0",
  rows: {},
  isNewArrival: false, isBestseller: false, isTrending: false, isFeatured: false, badge: "",
});

const comboKey = (color, size) => `${color ?? ""}|${size ?? ""}`;
const parseSizes = (text) => [...new Set(text.split(",").map((s) => s.trim()).filter(Boolean))];

function combos(form) {
  const colors = form.colors.map((c) => c.name.trim()).filter(Boolean);
  const sizes = parseSizes(form.sizesText);
  const out = [];
  for (const color of colors.length ? colors : [null]) {
    for (const size of sizes.length ? sizes : [null]) out.push({ color, size, key: comboKey(color, size) });
  }
  return out;
}

function ImageUpload({ title, images, onChange, required = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const valid = files.filter((file) => file.type.startsWith("image/"));
    if (valid.length !== files.length) setError("Please select image files only.");
    if (!valid.length) return;
    setBusy(true);
    setError("");
    try {
      const uploaded = [];
      for (const file of valid) {
        const result = await uploadImage(file, "product");
        uploaded.push({ url: result.url, publicId: result.publicId, alt: "" });
      }
      onChange([...images, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }

  function move(index, direction) {
    const next = [...images];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  }

  return (
    <div className="product-image-upload">
      <label className="product-field-label">
        {title} {required && <span className="required-star">*</span>}
      </label>
      <label className="product-file-picker">
        <span>{busy ? "Uploading…" : images.length ? `${images.length} image(s) uploaded` : "Upload Image..."}</span>
        <span className="product-browse">Browse</span>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={busy} onChange={handleFiles} />
      </label>
      <p className="product-image-hint">Images are stored in Cloudinary. The first image is the featured image. 800 × 800 px (square) recommended, max 5 MB.</p>
      {error && <p className="products-form-error">{error}</p>}
      {!!images.length && (
        <div className="product-image-previews">
          {images.map((image, index) => (
            <div className="product-image-preview" key={image.publicId || image.url}>
              <img src={image.url} alt={`${title} ${index + 1}`} />
              <button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => onChange(images.filter((_, i) => i !== index))}>×</button>
              {index > 0 && <button type="button" style={{ left: 4, right: "auto" }} aria-label={`Move image ${index + 1} left`} onClick={() => move(index, -1)}>‹</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductsPage({ query = "", categories = [] }) {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, pages: 1, summary: {} });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingStatusIds, setPendingStatusIds] = useState([]);

  const term = `${search} ${query}`.trim();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (term) params.set("q", term);
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      const result = await adminRequest(`/admin/products?${params}`);
      setItems(result.data);
      setMeta(result.meta || {});
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [page, term, categoryFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => { setPage(1); }, [term, categoryFilter, statusFilter]);

  const optionsForLevel = (levelIndex) => categories.filter((c) => c.level === levelIndex + 1 &&
    (levelIndex === 0 ? true : c.parentId === form.categoryIds[levelIndex - 1]));

  const sortedCategories = useMemo(() => {
    const byParent = new Map();
    for (const c of categories) {
      const key = c.parentId || "root";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    }
    const out = [];
    const walk = (key) => (byParent.get(key) || []).forEach((c) => { out.push(c); walk(c.id); });
    walk("root");
    return out;
  }, [categories]);

  function updateField(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  function selectCategory(levelIndex, id) {
    setForm((previous) => {
      const categoryIds = [...previous.categoryIds];
      categoryIds[levelIndex] = id;
      for (let i = levelIndex + 1; i < categoryIds.length; i++) categoryIds[i] = "";
      return { ...previous, categoryIds };
    });
  }

  function updateRow(key, field, value) {
    setForm((previous) => ({ ...previous, rows: { ...previous.rows, [key]: { ...previous.rows[key], [field]: value } } }));
  }

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setShowForm(true);
  }

  async function openEditForm(product) {
    setError("");
    let full = product;
    try {
      full = (await adminRequest(`/admin/products/${product.id}`)).data;
    } catch (requestError) {
      setLoadError(requestError.message);
      return;
    }
    const path = (full.categoryPath || []).map(String);
    const categoryIds = ["", "", "", "", ""].map((_, i) => path[i] || "");
    const rows = {};
    for (const v of full.variants || []) {
      rows[comboKey(v.color, v.size)] = { id: v.id, price: String(v.price ?? ""), mrp: v.mrp ? String(v.mrp) : "", stock: String(v.stock ?? 0), sku: v.sku || "", status: v.status };
    }
    const single = (full.variants || []).length === 1 && !full.colors?.length && !full.sizes?.length ? full.variants[0] : null;
    setEditingId(full.id);
    setForm({
      ...emptyForm(),
      name: full.name || "", sku: full.sku || "", brand: full.brand || "", description: full.description || "",
      status: full.status === "archived" ? "disabled" : full.status || "active",
      categoryIds,
      images: (full.images || []).map(({ url, publicId, alt }) => ({ url, publicId, alt: alt || "" })),
      colors: (full.colors || []).map(({ name, hex }) => ({ name, hex })),
      sizesText: (full.sizes || []).join(", "),
      price: single ? String(single.price) : "", mrp: single?.mrp ? String(single.mrp) : "", stock: single ? String(single.stock) : "0",
      rows,
      isNewArrival: Boolean(full.isNewArrival), isBestseller: Boolean(full.isBestseller),
      isTrending: Boolean(full.isTrending), isFeatured: Boolean(full.isFeatured), badge: full.badge || "",
    });
    setShowForm(true);
  }

  function buildVariants() {
    const list = combos(form);
    const simple = list.length === 1 && list[0].color === null && list[0].size === null;
    if (simple) {
      const existing = form.rows[list[0].key] || {};
      return [{ ...(existing.id ? { id: existing.id } : {}), color: null, size: null, price: form.price, mrp: form.mrp, stock: form.stock, status: "active" }];
    }
    return list.map(({ color, size, key }) => {
      const row = form.rows[key] || {};
      return {
        ...(row.id ? { id: row.id } : {}), color, size,
        price: row.price ?? form.price, mrp: row.mrp ?? form.mrp, stock: row.stock ?? form.stock,
        ...(row.sku ? { sku: row.sku } : {}), status: row.status || "active",
      };
    });
  }

  async function saveProduct(event) {
    event.preventDefault();
    setError("");

    if (form.name.trim().length < 2) return setError("Please enter a product name (at least 2 characters).");
    const category = [...form.categoryIds].reverse().find(Boolean);
    if (!category) return setError("Please select a category.");
    if (!form.images.length) return setError("Please upload a featured image.");
    const colorNames = form.colors.map((c) => c.name.trim());
    if (colorNames.some((n) => !n)) return setError("Every colour needs a name.");
    if (new Set(colorNames).size !== colorNames.length) return setError("Colour names must be unique.");

    const variants = buildVariants();
    for (const v of variants) {
      const label = [v.color, v.size].filter(Boolean).join(" / ") || "the product";
      const price = Number(v.price), mrp = v.mrp === "" ? 0 : Number(v.mrp), stock = v.stock === "" ? 0 : Number(v.stock);
      if (v.price === "" || !Number.isFinite(price) || price < 0) return setError(`Please enter a valid current price for ${label}.`);
      if (!Number.isFinite(mrp) || (mrp && mrp < price)) return setError(`Previous price for ${label} must be greater than or equal to the current price.`);
      if (!Number.isInteger(stock) || stock < 0) return setError(`Stock for ${label} must be a non-negative whole number.`);
      Object.assign(v, { price, mrp, stock });
    }

    const payload = {
      name: form.name.trim(),
      ...(form.sku.trim() ? { sku: form.sku.trim() } : {}),
      brand: form.brand,
      description: form.description.trim(),
      category,
      images: form.images.map(({ url, publicId }) => ({ url, publicId, alt: form.name.trim().slice(0, 200) })),
      colors: form.colors.map((c) => ({ name: c.name.trim(), hex: c.hex })),
      sizes: parseSizes(form.sizesText),
      variants,
      isNewArrival: form.isNewArrival, isBestseller: form.isBestseller, isTrending: form.isTrending, isFeatured: form.isFeatured,
      badge: form.badge,
      status: form.status,
    };

    setSaving(true);
    try {
      if (editingId) await adminRequest(`/admin/products/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await adminRequest("/admin/products", { method: "POST", body: JSON.stringify(payload) });
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Are you sure you want to delete "${product.name}"? Products that appear in orders are archived instead.`)) return;
    try {
      const result = await adminRequest(`/admin/products/${product.id}`, { method: "DELETE" });
      if (result.data.archived) window.alert("This product appears in past orders, so it was archived instead of deleted.");
      await load();
    } catch (requestError) {
      setLoadError(requestError.message);
    }
  }

  async function toggleStatus(product) {
    const nextStatus = product.status === "active" ? "disabled" : "active";
    setItems((current) => current.map((item) => item.id === product.id ? { ...item, status: nextStatus } : item));
    setPendingStatusIds((current) => [...current, product.id]);
    setLoadError("");
    try {
      await adminRequest(`/admin/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await load();
    } catch (requestError) {
      setItems((current) => current.map((item) => item.id === product.id ? { ...item, status: product.status } : item));
      setLoadError(requestError.message);
    } finally {
      setPendingStatusIds((current) => current.filter((id) => id !== product.id));
    }
  }

  const summary = meta.summary || {};
  const variantList = combos(form);
  const hasOptions = !(variantList.length === 1 && variantList[0].color === null && variantList[0].size === null);
  const brandOptions = form.brand && !productBrands.includes(form.brand) ? [form.brand, ...productBrands] : productBrands;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CATALOG</p>
          <h1>Manage Products</h1>
          <p className="muted">Add, edit and organize your Shoponzy product catalog.</p>
        </div>
        <button className="primary-button" onClick={openAddForm}>+ Add Product</button>
      </div>

      <div className="products-summary">
        <div className="products-summary-card"><span>Total Products</span><strong>{(summary.active || 0) + (summary.disabled || 0)}</strong></div>
        <div className="products-summary-card"><span>Enabled</span><strong>{summary.active || 0}</strong></div>
        <div className="products-summary-card"><span>Disabled</span><strong>{summary.disabled || 0}</strong></div>
      </div>

      <section className="panel table-panel">
        <div className="product-toolbar">
          <div><h2>All Products</h2><p className="muted">{loading ? "Loading…" : `${meta.total ?? items.length} products found`}</p></div>
          <div className="products-filter-controls">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." aria-label="Search products" />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter category">
              <option value="">All Categories</option>
              {sortedCategories.map((item) => <option key={item.id} value={item.id}>{"— ".repeat(item.level - 1)}{item.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status">
              <option value="">All Statuses</option><option value="active">Enabled</option><option value="disabled">Disabled</option><option value="archived">Archived</option>
            </select>
          </div>
        </div>
        {loadError && <div className="products-form-error" role="alert">{loadError}</div>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Current Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((product) => (
                <tr key={product.id}>
                  <td><div className="products-table-product">{product.images?.[0]?.url ? <img src={product.images[0].url} alt="" /> : <span className="products-no-image">□</span>}<span>{product.name}</span></div></td>
                  <td>{product.sku || product.variants?.[0]?.sku || "—"}</td>
                  <td>{product.category?.path || product.category?.name || "—"}</td>
                  <td>{money(product.minPrice)}{product.maxPrice > product.minPrice ? ` – ${money(product.maxPrice)}` : ""}</td>
                  <td>{product.totalStock ?? 0}{product.variants?.length > 1 ? ` (${product.variants.length} variants)` : ""}</td>
                  <td>{product.status === "archived"
                    ? <span className="products-status disabled">archived</span>
                    : <StatusToggle checked={product.status === "active"} label={`${product.status === "active" ? "Disable" : "Enable"} ${product.name}`} statusText={product.status === "active" ? "Enabled" : "Disabled"} onChange={() => toggleStatus(product)} disabled={pendingStatusIds.includes(product.id)} />}
                  </td>
                  <td><div className="action-buttons">
                    <button className="table-action edit-icon-button" aria-label={`Edit ${product.name}`} title={`Edit ${product.name}`} onClick={() => openEditForm(product)}><EditIcon /></button>
                    <button className="table-action danger" onClick={() => deleteProduct(product)}>Delete</button>
                  </div></td>
                </tr>
              ))}
              {!items.length && !loading && <tr><td colSpan={7} className="empty-state">No products found. Click Add Product to create one.</td></tr>}
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

      {showForm && (
        <div className="modal-backdrop" onClick={() => !saving && setShowForm(false)}>
          <section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-heading">
              <div><p className="eyebrow">PRODUCT CATALOG</p><h2 id="product-form-title">{editingId ? "Edit Product" : "Add Product"}</h2></div>
              <button type="button" className="close-button" onClick={() => setShowForm(false)} aria-label="Close form">×</button>
            </div>

            {error && <div className="products-form-error" role="alert">{error}</div>}

            <form onSubmit={saveProduct}>
              <div className="products-form-grid">
                <label className="products-form-field">Product Name *
                  <input required value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Enter product name" />
                </label>
                <label className="products-form-field">SKU / Product Code
                  <input value={form.sku} onChange={(e) => updateField("sku", e.target.value)} placeholder="e.g. CLO-001" />
                </label>

                <div className="products-form-field products-form-full">
                  <ImageUpload title="Product Images (first = featured)" required images={form.images} onChange={(value) => updateField("images", value)} />
                </div>

                {LEVEL_LABELS.map((label, index) => (
                  <label className="products-form-field" key={label}>{label}
                    <select required={index === 0} value={form.categoryIds[index]} disabled={index > 0 && !form.categoryIds[index - 1]} onChange={(e) => selectCategory(index, e.target.value)}>
                      <option value="">Select One</option>
                      {optionsForLevel(index).map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === "disabled" ? " (disabled)" : ""}</option>)}
                    </select>
                  </label>
                ))}

                <label className="products-form-field">Select Brand
                  <select value={form.brand} onChange={(e) => updateField("brand", e.target.value)}>
                    <option value="">Select Brand</option>{brandOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="products-form-field">Status
                  <select value={form.status} onChange={(e) => updateField("status", e.target.value)}>
                    <option value="active">Enabled</option><option value="disabled">Disabled</option>
                  </select>
                </label>

                <div className="products-form-field products-form-full">
                  <span>Colours</span>
                  {form.colors.map((color, index) => (
                    <div key={index} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                      <input type="color" value={color.hex} onChange={(e) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, hex: e.target.value.toUpperCase() } : c))} aria-label={`Colour ${index + 1} swatch`} style={{ width: 48, padding: 2 }} />
                      <input value={color.name} onChange={(e) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, name: e.target.value } : c))} placeholder="Colour name, e.g. Black" aria-label={`Colour ${index + 1} name`} />
                      <button type="button" className="table-action danger" onClick={() => updateField("colors", form.colors.filter((_, i) => i !== index))}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="table-action" style={{ marginTop: 8, width: "fit-content" }} onClick={() => updateField("colors", [...form.colors, { name: "", hex: "#111111" }])}>+ Add colour</button>
                </div>
                <label className="products-form-field products-form-full">Sizes (comma separated, leave empty if none)
                  <input value={form.sizesText} onChange={(e) => updateField("sizesText", e.target.value)} placeholder="e.g. 6, 7, 8, 9 or S, M, L" />
                </label>

                <label className="products-form-field">{hasOptions ? "Default Current Price" : "Current Price *"}
                  <div className="products-price-input"><span>₹</span><input required={!hasOptions} type="number" min="0" step="0.01" value={form.price} onChange={(e) => updateField("price", e.target.value)} placeholder="Enter current price" /></div>
                </label>
                <label className="products-form-field">{hasOptions ? "Default Previous Price" : "Previous Price"}
                  <div className="products-price-input"><span>₹</span><input type="number" min="0" step="0.01" value={form.mrp} onChange={(e) => updateField("mrp", e.target.value)} placeholder="Enter previous price" /></div>
                </label>
                <label className="products-form-field">{hasOptions ? "Default Stock Quantity" : "Stock Quantity"}
                  <input type="number" min="0" step="1" value={form.stock} onChange={(e) => updateField("stock", e.target.value)} placeholder="Enter stock quantity" />
                </label>

                {hasOptions && (
                  <div className="products-form-field products-form-full">
                    <span>Variants ({variantList.length}) — empty cells use the defaults above</span>
                    <div className="table-scroll">
                      <table>
                        <thead><tr><th>Colour</th><th>Size</th><th>Price</th><th>Previous price</th><th>Stock</th><th>SKU</th></tr></thead>
                        <tbody>
                          {variantList.map(({ color, size, key }) => {
                            const row = form.rows[key] || {};
                            return (
                              <tr key={key}>
                                <td>{color || "—"}</td><td>{size || "—"}</td>
                                <td><input type="number" min="0" step="0.01" value={row.price ?? ""} placeholder={form.price} onChange={(e) => updateRow(key, "price", e.target.value === "" ? undefined : e.target.value)} aria-label={`Price ${key}`} /></td>
                                <td><input type="number" min="0" step="0.01" value={row.mrp ?? ""} placeholder={form.mrp} onChange={(e) => updateRow(key, "mrp", e.target.value === "" ? undefined : e.target.value)} aria-label={`Previous price ${key}`} /></td>
                                <td><input type="number" min="0" step="1" value={row.stock ?? ""} placeholder={form.stock} onChange={(e) => updateRow(key, "stock", e.target.value === "" ? undefined : e.target.value)} aria-label={`Stock ${key}`} /></td>
                                <td><input value={row.sku ?? ""} onChange={(e) => updateRow(key, "sku", e.target.value)} aria-label={`SKU ${key}`} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="products-form-field products-form-full">
                  <span>Quick Listing</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 6 }}>
                    {FLAGS.map(([key, label]) => (
                      <label key={key} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 500 }}>
                        <input type="checkbox" checked={form[key]} onChange={(e) => updateField(key, e.target.checked)} style={{ width: "auto" }} />{label}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="products-form-field">Badge
                  <select value={form.badge} onChange={(e) => updateField("badge", e.target.value)}>
                    {BADGES.map((item) => <option key={item || "none"} value={item}>{item || "No badge"}</option>)}
                  </select>
                </label>
                <label className="products-form-field products-form-full">Description
                  <textarea rows={4} value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Enter product description" />
                </label>
              </div>
              <p className="form-hint">Products are saved to the database and appear on the storefront when enabled.</p>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : editingId ? "Save Changes" : "Add Product"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
