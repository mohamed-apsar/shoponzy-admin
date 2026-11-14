import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminRequest, uploadImage } from "../api/adminApi";
import ImageCropper from "./ImageCropper";
import { IMAGE_SIZES, cropHint, sizeLabel } from "../utils/imageSizes";
import { money } from "../utils/format";
import EditIcon from "./EditIcon";
import StatusToggle from "./StatusToggle";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

/* eslint-disable react/prop-types */
const LEVEL_LABELS = ["Select Category *", "Select Sub Category"];
const productBrands = ["Unbranded", "Nike", "Adidas", "Puma", "Levi's", "Ray-Ban", "Calvin Klein", "Other"];
const FLAGS = [
  ["isNewArrival", "New Arrivals"],
  ["isBestseller", "Bestseller"],
  ["isTrending", "Trending"],
  ["isFeatured", "Featured"],
  ["isShopByOccasion", "Shop by occasion"],
];
const SHOP_BY_OCCASION = "shop-by-occasion";
const PAGE_SIZE = 20;

const ROW_SLOTS = ["image1", "image2", "image3"];
const emptyRowImages = () => ({ image1: null, image2: null, image3: null });
const imageRefOf = (image) => (image ? { url: image.url, publicId: image.publicId, alt: image.alt || "" } : null);
const emptyVariantShowcaseBlocks = () => [{ type: "banner", image: null }, { type: "imageRow", images: [null, null, null] }];
const newColor = () => ({ name: "", hex: "#111111", featuredImage: null, images: [], showcaseBlocks: emptyVariantShowcaseBlocks(), price: "", stock: "0", minStock: "0" });

// One empty banner + one empty three-image row, so both upload slots are visible without clicking "Add".
const defaultContentBlocks = () => [{ type: "banner", image: null }, { type: "imageRow", images: [null, null, null] }];

const emptyForm = () => ({
  name: "", sku: "", brand: "", description: "", status: "active",
  categoryIds: ["", "", "", "", ""],
  images: [],
  seo: { title: "", description: "", image: null, imageTitle: "", robots: "index, follow" },
  colors: [newColor()], contentBlocks: defaultContentBlocks(), sizesText: "",
  price: "", mrp: "", stock: "0",
  rows: {},
  isNewArrival: false, isBestseller: false, isTrending: false, isFeatured: false, isShopByOccasion: false, occasions: [], badge: "",
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

const CROPPABLE = ["image/jpeg", "image/png", "image/webp"];

/* Every chosen file is cropped to `size` before upload; several files are cropped one after another.
   An uploaded image can be re-cropped (✂), which replaces it in place. */
function ImageUpload({ title, images, onChange, required = false, multiple = true, kind = "product", size = IMAGE_SIZES.productImage }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState([]); // [{ source: File | url, replace: index | null }]
  const [cropKey, setCropKey] = useState(0);

  function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    const valid = files.filter((file) => CROPPABLE.includes(file.type));
    if (valid.length !== files.length) setError("Please select JPG, JPEG, PNG or WebP images.");
    else setError("");
    if (!valid.length) return;
    setQueue((multiple ? valid : valid.slice(0, 1)).map((source) => ({ source, replace: null })));
    setCropKey((key) => key + 1);
  }

  async function uploadCropped(file) {
    const job = queue[0];
    setBusy(true);
    setError("");
    try {
      const result = await uploadImage(file, kind);
      const image = { url: result.url, publicId: result.publicId, alt: "" };
      if (job.replace !== null) onChange(images.map((item, index) => (index === job.replace ? image : item)));
      else onChange(multiple ? [...images, image] : [image]);
      setQueue((current) => current.slice(1));
      setCropKey((key) => key + 1);
    } catch (uploadError) {
      setError(uploadError.message);
      setQueue([]);
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
        <span>{busy ? "Uploading…" : images.length ? `${images.length} image(s) uploaded${multiple ? "" : " — choose to replace"}` : "Upload Image..."}</span>
        <span className="product-browse">Browse</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} disabled={busy || queue.length > 0} onChange={handleFiles} />
      </label>
      <p className="product-image-hint">{cropHint(size)}</p>
      {error && <p className="products-form-error">{error}</p>}
      {!!images.length && (
        <div className="product-image-previews">
          {images.map((image, index) => (
            <div className={`product-image-preview is-shaped${size.width >= size.height * 2 ? " is-wide" : ""}`} key={image.publicId || image.url} style={{ aspectRatio: `${size.width} / ${size.height}` }}>
              <img src={image.url} alt={`${title} ${index + 1}`} />
              <button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => onChange(images.filter((_, i) => i !== index))}>×</button>
              {index > 0 && <button type="button" style={{ left: 4, right: "auto" }} aria-label={`Move image ${index + 1} left`} onClick={() => move(index, -1)}>‹</button>}
              <button type="button" className="product-image-crop" title="Crop this image" aria-label={`Crop image ${index + 1}`} disabled={busy}
                onClick={() => { setQueue([{ source: image.url, replace: index }]); setCropKey((key) => key + 1); }}>✂</button>
            </div>
          ))}
        </div>
      )}
      {queue.length > 0 && <ImageCropper
        key={cropKey}
        source={queue[0].source}
        title={queue.length > 1 ? `${title} (${queue.length} left)` : title}
        aspect={size.width / size.height}
        output={size}
        onCancel={() => setQueue([])}
        onConfirm={uploadCropped}
      />}
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
  const [deleting, setDeleting] = useState(null);
  const [selected, setSelected] = useState({}); // id -> name; kept across pages and filters
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [badges, setBadges] = useState([]);
  const [badgesError, setBadgesError] = useState("");
  const loadSequence = useRef(0);

  const term = `${search} ${query}`.trim();

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (term) params.set("q", term);
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      const result = await adminRequest(`/admin/products?${params}`);
      if (sequence !== loadSequence.current) return;
      setItems(result.data);
      setMeta(result.meta || {});
    } catch (requestError) {
      if (sequence === loadSequence.current) setLoadError(requestError.message);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [page, term, categoryFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    adminRequest("/admin/product-badges")
      .then((result) => { if (active) setBadges(result.data.badges || []); })
      .catch((requestError) => { if (active) setBadgesError(requestError.message); });
    return () => { active = false; };
  }, []);

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

  function updateSeoField(field, value) {
    setForm((previous) => ({ ...previous, seo: { ...previous.seo, [field]: value } }));
  }

  function generateProductSeo() {
    const title = form.name.trim();
    const description = (form.description.trim() || `${title}${form.brand ? ` by ${form.brand}` : ""}. Shop online at Shoponzy.`).slice(0, 160);
    updateField("seo", { ...form.seo, title: title.slice(0, 70), description });
  }

  function selectCategory(levelIndex, id) {
    setForm((previous) => {
      const categoryIds = [...previous.categoryIds];
      categoryIds[levelIndex] = id;
      for (let i = levelIndex + 1; i < categoryIds.length; i++) categoryIds[i] = "";
      const selected = categories.find((category) => category.id === id);
      return { ...previous, categoryIds, ...(levelIndex <= 1 ? { brand: levelIndex === 1 ? selected?.brand || "" : "" } : {}) };
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
      rows[comboKey(v.color, v.size)] = { id: v.id, price: String(v.price ?? ""), mrp: v.mrp ? String(v.mrp) : "", stock: String(v.stock ?? 0), minStock: String(v.minStock ?? 0), sku: v.sku || "", status: v.status };
    }
    const single = (full.variants || []).length === 1 && !full.colors?.length && !full.sizes?.length ? full.variants[0] : null;
    setEditingId(full.id);
    setForm({
      ...emptyForm(),
      name: full.name || "", sku: full.sku || "", brand: full.brand || "", description: full.description || "",
      status: full.status === "archived" ? "disabled" : full.status || "active",
      categoryIds,
      images: (full.images || []).map(({ url, publicId, alt }) => ({ url, publicId, alt: alt || "" })),
      colors: (full.colors || []).map(({ name, hex, featuredImage, images, bannerImage, rowImages, showcaseBlocks }) => {
        const inventory = (full.variants || []).find((variant) => variant.color === name);
        const oldRow = ROW_SLOTS.map((slot) => imageRefOf(rowImages?.[slot]));
        const migratedBlocks = [
          ...(bannerImage?.url ? [{ type: "banner", image: imageRefOf(bannerImage) }] : []),
          ...(oldRow.some(Boolean) ? [{ type: "imageRow", images: oldRow }] : []),
        ];
        const blocks = showcaseBlocks?.length ? showcaseBlocks : migratedBlocks.length ? migratedBlocks : emptyVariantShowcaseBlocks();
        return {
          name, hex, price: String(inventory?.price ?? ""), stock: String(inventory?.stock ?? 0), minStock: String(inventory?.minStock ?? 0),
          featuredImage: featuredImage ? { url: featuredImage.url, publicId: featuredImage.publicId, alt: featuredImage.alt || "" } : null,
          images: (images || []).map(({ url, publicId, alt }) => ({ url, publicId, alt: alt || "" })),
          showcaseBlocks: blocks.map((block) => block.type === "banner"
            ? { type: "banner", image: imageRefOf(block.image) }
            : { type: "imageRow", images: Array.from({ length: 3 }, (_, i) => imageRefOf(block.images?.[i])) }),
        };
      }),
      contentBlocks: !full.contentBlocks?.length ? defaultContentBlocks() : full.contentBlocks.map((block) => block.type === "banner"
        ? { type: block.type, image: block.image ? { url: block.image.url, publicId: block.image.publicId, alt: block.image.alt || "" } : null }
        : { type: block.type, images: Array.from({ length: 3 }, (_, index) => {
          const image = block.images?.[index];
          return image ? { url: image.url, publicId: image.publicId, alt: image.alt || "" } : null;
        }) }),
      seo: {
        title: full.seo?.title || "",
        description: full.seo?.description || "",
        image: full.seo?.image ? { url: full.seo.image.url, publicId: full.seo.image.publicId, alt: full.seo.image.alt || "" } : null,
        imageTitle: full.seo?.image?.alt || "",
        robots: full.seo?.robots || "index, follow",
      },
      sizesText: (full.sizes || []).join(", "),
      price: single ? String(single.price) : "", mrp: single?.mrp ? String(single.mrp) : "", stock: single ? String(single.stock) : "0",
      rows,
      isNewArrival: Boolean(full.isNewArrival), isBestseller: Boolean(full.isBestseller),
      isTrending: Boolean(full.isTrending), isFeatured: Boolean(full.isFeatured),
      isShopByOccasion: (full.occasions || []).includes(SHOP_BY_OCCASION), occasions: full.occasions || [], badge: full.badge || "",
    });
    setShowForm(true);
  }

  function buildVariants() {
    const list = combos(form);
    const simple = list.length === 1 && list[0].color === null && list[0].size === null;
    if (simple) {
      const existing = form.rows[list[0].key] || {};
      return [{
        ...(existing.id ? { id: existing.id } : {}), color: null, size: null,
        price: existing.price ?? form.price, mrp: existing.mrp ?? form.mrp,
        stock: existing.stock ?? form.stock, minStock: Number(existing.minStock ?? 0), status: "active",
      }];
    }
    const hasSizeVariants = parseSizes(form.sizesText).length > 0;
    return list.map(({ color, size, key }) => {
      const row = form.rows[key] || form.rows[comboKey(null, null)] || {};
      const colorDefaults = form.colors.find((item) => item.name.trim() === color);
      const defaultStock = colorDefaults?.stock ?? form.stock;
      const defaultMinStock = Number(colorDefaults?.minStock ?? 0);
      return {
        ...(row.id ? { id: row.id } : {}), color, size,
        price: hasSizeVariants ? row.price ?? colorDefaults?.price ?? form.price : colorDefaults?.price ?? row.price ?? form.price,
        mrp: row.mrp ?? form.mrp,
        stock: hasSizeVariants ? row.stock ?? defaultStock : defaultStock,
        minStock: hasSizeVariants && row.minStock !== undefined && row.minStock !== "" ? Number(row.minStock) : defaultMinStock,
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
    if (form.colors.some((color) => !color.featuredImage)) return setError("Upload a featured image for every colour variant.");
    const colorNames = form.colors.map((c) => c.name.trim());
    if (colorNames.some((n) => !n)) return setError("Every colour needs a name.");
    if (new Set(colorNames).size !== colorNames.length) return setError("Colour names must be unique.");
    for (const color of form.colors) {
      const partialRow = (color.showcaseBlocks || []).some((block) => block.type === "imageRow" && block.images.some(Boolean) && block.images.some((image) => !image));
      if (partialRow) return setError(`Every three-image row for ${color.name} needs all 3 images. Complete the row or remove it.`);
    }
    // Completely empty blocks are skipped; a row needs all three images (the storefront shows them side by side).
    const contentBlocks = form.colors.length ? [] : form.contentBlocks.filter((block) => (block.type === "banner" ? block.image : block.images.some(Boolean)));
    if (contentBlocks.some((block) => block.type === "imageRow" && block.images.some((image) => !image))) {
      return setError("Each three-image row needs all 3 images. Upload the missing ones or remove the row.");
    }

    const variants = buildVariants();
    for (const v of variants) {
      const label = [v.color, v.size].filter(Boolean).join(" / ") || "the product";
      const price = Number(v.price), mrp = v.mrp === "" ? 0 : Number(v.mrp), stock = v.stock === "" ? 0 : Number(v.stock);
      if (v.price === "" || !Number.isFinite(price) || price < 0) return setError(`Please enter a valid current price for ${label}.`);
      if (!Number.isFinite(mrp) || (mrp && mrp < price)) return setError(`Previous price for ${label} must be greater than or equal to the current price.`);
      if (!Number.isInteger(stock) || stock < 0) return setError(`Stock for ${label} must be a non-negative whole number.`);
      if (!Number.isInteger(v.minStock) || v.minStock < 0) return setError(`Minimum stock for ${label} must be a non-negative whole number.`);
      Object.assign(v, { price, mrp, stock });
    }

    const payload = {
      name: form.name.trim(),
      ...(form.sku.trim() ? { sku: form.sku.trim() } : {}),
      brand: form.brand,
      description: form.description.trim(),
      category,
      images: form.images.map(({ url, publicId }) => ({ url, publicId, alt: form.name.trim().slice(0, 200) })),
      colors: form.colors.map((color) => ({
        name: color.name.trim(), hex: color.hex,
        featuredImage: color.featuredImage || null,
        images: color.images || [],
        bannerImage: null,
        rowImages: emptyRowImages(),
        showcaseBlocks: (color.showcaseBlocks || []).filter((block) => block.type === "banner" ? block.image : block.images.some(Boolean)).map((block, blockIndex) => block.type === "banner"
          ? { type: "banner", image: { ...block.image, alt: block.image.alt || `${form.name.trim()} ${color.name.trim()} banner ${blockIndex + 1}` } }
          : { type: "imageRow", images: block.images.map((image, imageIndex) => ({ ...image, alt: image.alt || `${form.name.trim()} ${color.name.trim()} image ${blockIndex + 1}-${imageIndex + 1}` })) }),
      })),
      contentBlocks: contentBlocks.map((block, blockIndex) => block.type === "banner"
        ? { type: block.type, image: { ...block.image, alt: block.image.alt || `${form.name.trim()} banner ${blockIndex + 1}` } }
        : { type: block.type, images: block.images.map((image, imageIndex) => ({
          ...image, alt: image.alt || `${form.name.trim()} image ${imageIndex + 1}`,
        })) }),
      sizes: parseSizes(form.sizesText),
      variants,
      isNewArrival: form.isNewArrival, isBestseller: form.isBestseller, isTrending: form.isTrending, isFeatured: form.isFeatured,
      occasions: [...new Set([...(form.occasions || []).filter((occasion) => occasion !== SHOP_BY_OCCASION), ...(form.isShopByOccasion ? [SHOP_BY_OCCASION] : [])])],
      badge: form.badge,
      seo: {
        title: form.seo.title,
        description: form.seo.description,
        image: form.seo.image ? { ...form.seo.image, alt: form.seo.imageTitle.trim() } : null,
        robots: form.seo.robots,
      },
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
    setDeleting(product);
  }

  async function confirmDeleteProduct() {
    try {
      const result = await adminRequest(`/admin/products/${deleting.id}`, { method: "DELETE" });
      if (result.data.archived) window.alert("This product appears in past orders, so it was archived instead of deleted.");
      await load();
    } catch (requestError) {
      setLoadError(requestError.message);
      throw requestError;
    }
  }

  const selectedIds = Object.keys(selected);
  const pageIds = items.map((product) => product.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected[id]);
  const somePageSelected = pageIds.some((id) => selected[id]);
  const toggleSelected = (product) => setSelected((current) => {
    const next = { ...current };
    if (next[product.id]) delete next[product.id]; else next[product.id] = product.name;
    return next;
  });
  const toggleAllOnPage = () => setSelected((current) => {
    const next = { ...current };
    for (const product of items) { if (allPageSelected) delete next[product.id]; else next[product.id] = product.name; }
    return next;
  });

  async function confirmBulkDelete() {
    const ids = selectedIds.slice(0, 200);
    try {
      const result = await adminRequest("/admin/products/bulk", { method: "POST", body: JSON.stringify({ ids, action: "delete" }) });
      const results = result.data.results;
      const failed = results.filter((r) => !r.ok).map((r) => ({ id: r.id, name: selected[r.id] || r.id, error: r.error }));
      setBulkResult({
        deleted: results.filter((r) => r.ok && !r.archived).length,
        archived: results.filter((r) => r.ok && r.archived).map((r) => selected[r.id] || r.id),
        failed,
      });
      setSelected(Object.fromEntries(failed.map((f) => [f.id, f.name])));
    } finally {
      await load();
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
  const hasSizeOptions = parseSizes(form.sizesText).length > 0;
  const brandOptions = form.brand && !productBrands.includes(form.brand) ? [form.brand, ...productBrands] : productBrands;
  const badgeOptions = form.badge && !badges.includes(form.badge) ? [...badges, form.badge] : badges;

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
        {selectedIds.length > 0 && <div className="products-bulk-bar" role="region" aria-label="Bulk actions">
          <strong>{selectedIds.length} selected</strong>
          <button type="button" className="products-bulk-delete" onClick={() => { setBulkResult(null); setBulkConfirm(true); }}>Delete selected</button>
          <button type="button" className="products-bulk-clear" onClick={() => setSelected({})}>Clear selection</button>
          {selectedIds.length > 200 && <span>Up to 200 are deleted at a time.</span>}
        </div>}
        {bulkResult && <div className={`products-bulk-result${bulkResult.failed.length || bulkResult.archived.length ? " has-notes" : ""}`} role="status">
          <span>Deleted {bulkResult.deleted} product{bulkResult.deleted === 1 ? "" : "s"}.</span>
          {bulkResult.archived.length > 0 && <span> {bulkResult.archived.length} appear in past orders, so they were archived instead: {bulkResult.archived.join(", ")}.</span>}
          {bulkResult.failed.length > 0 && <ul>{bulkResult.failed.map((f) => <li key={f.id}><b>{f.name}</b> — {f.error}</li>)}</ul>}
          <button type="button" aria-label="Dismiss" onClick={() => setBulkResult(null)}>×</button>
        </div>}
        <div className="table-scroll">
          <table>
            <thead><tr><th className="products-select-col"><input type="checkbox" aria-label="Select all products on this page" checked={allPageSelected} ref={(el) => { if (el) el.indeterminate = !allPageSelected && somePageSelected; }} onChange={toggleAllOnPage} disabled={!pageIds.length} /></th><th>Product</th><th>SKU</th><th>Category</th><th>Current Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((product) => (
                <tr key={product.id} className={selected[product.id] ? "products-row-selected" : undefined}>
                  <td className="products-select-col"><input type="checkbox" aria-label={`Select ${product.name}`} checked={Boolean(selected[product.id])} onChange={() => toggleSelected(product)} /></td>
                  <td><div className="products-table-product">{product.images?.[0]?.url || product.colors?.[0]?.featuredImage?.url
                    ? <img src={product.images?.[0]?.url || product.colors[0].featuredImage.url} alt="" />
                    : <span className="products-no-image">□</span>}<span>{product.name}</span></div></td>
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
              {!items.length && !loading && <tr><td colSpan={8} className="empty-state">No products found. Click Add Product to create one.</td></tr>}
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

                {LEVEL_LABELS.map((label, index) => {
                  const options = optionsForLevel(index);
                  const shouldShow = index === 0 || (form.categoryIds[index - 1] && options.length > 0);
                  if (!shouldShow) return null;
                  return (
                    <label className="products-form-field" key={label}>{label}
                      <select required={index === 0} value={form.categoryIds[index]} onChange={(e) => selectCategory(index, e.target.value)}>
                        <option value="">Select One</option>
                        {options.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === "disabled" ? " (disabled)" : ""}</option>)}
                      </select>
                    </label>
                  );
                })}

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
                  <span>Main product image and colour variants</span>
                  {form.colors.map((color, index) => (
                    <section className="product-color-variant" key={index}>
                      <div className="product-color-controls">
                        <span className="product-color-role">{index === 0 ? "Main product image" : `Colour variant ${index}`}</span>
                        <label className="product-color-control product-color-name"><span>Colour name *</span><input value={color.name} onChange={(e) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, name: e.target.value } : c))} placeholder="e.g. Black" aria-label={`Colour ${index + 1} name`} /></label>
                        <label className="product-color-control product-color-swatch"><span>Choose colour</span><input type="color" value={color.hex} onChange={(e) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, hex: e.target.value.toUpperCase() } : c))} aria-label={`Colour ${index + 1} swatch`} /></label>
                        {index > 0 && <button type="button" className="table-action danger product-color-remove" onClick={() => updateField("colors", form.colors.filter((_, i) => i !== index))}>Remove variant</button>}
                      </div>
                      <div className="product-color-variant-images">
                        <ImageUpload
                          title={`${color.name || `Colour ${index + 1}`} featured image`}
                          images={color.featuredImage ? [color.featuredImage] : []}
                          multiple={false}
                          required
                          onChange={(images) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, featuredImage: images[0] || null } : c))}
                        />
                        <ImageUpload
                          kind="productVariant"
                          title={`${color.name || `Colour ${index + 1}`} product gallery`}
                          images={color.images || []}
                          onChange={(images) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, images } : c))}
                        />
                      </div>
                      <div className="product-color-showcase">
                        <p className="product-color-showcase-title">{index === 0 ? `Main product${color.name ? ` (${color.name})` : ""}` : `Variant ${index}${color.name ? ` (${color.name})` : ""}`} banner and image rows <small>(shown with this product colour; optional)</small></p>
                        {(color.showcaseBlocks || []).map((block, blockIndex) => <section className="product-content-block" key={`${block.type}-${blockIndex}`}>
                          <div className="product-content-block-heading">
                            <strong>{index === 0 ? (block.type === "banner" ? `Product banner ${blockIndex + 1}` : `Product three-image row ${blockIndex + 1}`) : (block.type === "banner" ? `Variant banner ${blockIndex + 1}` : `Variant three-image row ${blockIndex + 1}`)}</strong>
                            <button type="button" className="table-action danger" onClick={() => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, showcaseBlocks: c.showcaseBlocks.filter((_, j) => j !== blockIndex) } : c))}>Remove</button>
                          </div>
                          {block.type === "banner" ? <ImageUpload
                            kind="productVariant"
                            title={`${color.name || `Colour ${index + 1}`} banner ${blockIndex + 1}`}
                            images={block.image ? [block.image] : []}
                            multiple={false}
                            size={IMAGE_SIZES.productBanner}
                            onChange={(images) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, showcaseBlocks: c.showcaseBlocks.map((entry, j) => j === blockIndex ? { ...entry, image: images[0] || null } : entry) } : c))}
                          /> : <div className="product-content-image-row">
                            {Array.from({ length: 3 }, (_, imageIndex) => <ImageUpload
                              key={imageIndex}
                              kind="productVariant"
                              title={`${color.name || `Colour ${index + 1}`} row ${blockIndex + 1} image ${imageIndex + 1}`}
                              images={block.images?.[imageIndex] ? [block.images[imageIndex]] : []}
                              multiple={false}
                              size={IMAGE_SIZES.productRowImage}
                              onChange={(images) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, showcaseBlocks: c.showcaseBlocks.map((entry, j) => j === blockIndex ? { ...entry, images: entry.images.map((image, k) => k === imageIndex ? images[0] || null : image) } : entry) } : c))}
                            />)}
                          </div>}
                        </section>)}
                        <div className="product-color-showcase-actions">
                          <button type="button" className="table-action" onClick={() => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, showcaseBlocks: [...c.showcaseBlocks, { type: "banner", image: null }] } : c))}>+ Add {index === 0 ? "product" : "variant"} banner</button>
                          <button type="button" className="table-action" onClick={() => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, showcaseBlocks: [...c.showcaseBlocks, { type: "imageRow", images: [null, null, null] }] } : c))}>+ Add {index === 0 ? "product" : "variant"} three-image row</button>
                        </div>
                      </div>
                      <div className="products-variant-fields product-color-inventory-fields">
                        <label>Current amount *
                          <input type="number" min="0" step="0.01" value={color.price ?? ""} placeholder={form.price || "Enter current amount"} onChange={(e) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, price: e.target.value } : c))} aria-label={`Current amount for colour ${index + 1}`} />
                        </label>
                              <label>Stock quantity *
                                <input type="number" min="0" step="1" value={color.stock ?? "0"} onChange={(e) => {
                                  const stock = e.target.value;
                                  updateField("colors", form.colors.map((c, i) => i === index ? { ...c, stock } : c));
                                }} aria-label={`Stock quantity for colour ${index + 1}`} />
                        </label>
                        <label>Minimum stock
                          <input type="number" min="0" step="1" value={color.minStock ?? "0"} onChange={(e) => updateField("colors", form.colors.map((c, i) => i === index ? { ...c, minStock: e.target.value } : c))} aria-label={`Minimum stock for colour ${index + 1}`} />
                        </label>
                      </div>
                    </section>
                  ))}
                  <button type="button" className="table-action" style={{ marginTop: 8, width: "fit-content" }} onClick={() => updateField("colors", [...form.colors, newColor()])}>+ Add colour variant</button>
                </div>
                {!form.colors.length && <div className="products-form-field products-form-full">
                  <span>Product Banner &amp; Three-Image Row</span>
                  <p className="muted">Shown below the product details on the product page, in the order listed. Banner: {sizeLabel(IMAGE_SIZES.productBanner)}. Row images: {sizeLabel(IMAGE_SIZES.productRowImage)} each. Leave a block empty to skip it.</p>
                  {form.contentBlocks.map((block, index) => (
                    <section className="product-content-block" key={index}>
                      <div className="product-content-block-heading">
                        <strong>{block.type === "banner" ? `Wide banner ${index + 1}` : `Three-image row ${index + 1}`}</strong>
                        <div>
                          <button type="button" className="table-action" aria-label={`Move content block ${index + 1} up`} disabled={index === 0} onClick={() => {
                            const next = [...form.contentBlocks];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            updateField("contentBlocks", next);
                          }}>↑</button>
                          <button type="button" className="table-action" aria-label={`Move content block ${index + 1} down`} disabled={index === form.contentBlocks.length - 1} onClick={() => {
                            const next = [...form.contentBlocks];
                            [next[index], next[index + 1]] = [next[index + 1], next[index]];
                            updateField("contentBlocks", next);
                          }}>↓</button>
                          <button type="button" className="table-action danger" onClick={() => updateField("contentBlocks", form.contentBlocks.filter((_, blockIndex) => blockIndex !== index))}>Remove</button>
                        </div>
                      </div>
                      {block.type === "banner" ? (
                        <ImageUpload
                          kind="productGallery"
                          title={`Banner ${index + 1}`}
                          images={block.image ? [block.image] : []}
                          multiple={false}
                          size={IMAGE_SIZES.productBanner}
                          onChange={(images) => updateField("contentBlocks", form.contentBlocks.map((item, blockIndex) => blockIndex === index ? { ...item, image: images[0] || null } : item))}
                        />
                      ) : (
                        <div className="product-content-image-row">
                          {Array.from({ length: 3 }, (_, imageIndex) => (
                            <ImageUpload
                              kind="productGallery"
                              key={imageIndex}
                              title={`Row ${index + 1} image ${imageIndex + 1}`}
                              images={block.images[imageIndex] ? [block.images[imageIndex]] : []}
                              multiple={false}
                              size={IMAGE_SIZES.productRowImage}
                              onChange={(images) => updateField("contentBlocks", form.contentBlocks.map((item, blockIndex) => blockIndex === index
                                ? { ...item, images: item.images.map((image, itemIndex) => itemIndex === imageIndex ? images[0] || null : image) }
                                : item))}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                  <div className="product-content-add-actions">
                    <button type="button" className="table-action" onClick={() => updateField("contentBlocks", [...form.contentBlocks, { type: "banner", image: null }])}>+ Add wide banner</button>
                    <button type="button" className="table-action" onClick={() => updateField("contentBlocks", [...form.contentBlocks, { type: "imageRow", images: [null, null, null] }])}>+ Add three-image row</button>
                  </div>
                </div>}
                <label className="products-form-field products-form-full">Sizes (comma separated, leave empty if none)
                  <input value={form.sizesText} onChange={(e) => updateField("sizesText", e.target.value)} placeholder="e.g. 6, 7, 8, 9 or S, M, L" />
                </label>

                {!form.colors.length && <label className="products-form-field">{hasOptions ? "Default Current Price" : "Current Price *"}
                  <div className="products-price-input"><span>₹</span><input required={!hasOptions} type="number" min="0" step="0.01" value={form.price} onChange={(e) => updateField("price", e.target.value)} placeholder="Enter current price" /></div>
                </label>}
                {hasOptions && hasSizeOptions && <div className="products-form-field products-form-full">
                  <span>Variant pricing and stock ({variantList.length})</span>
                  <p className="products-variant-hint">Set individual values for each variant. Colour stock values are used as defaults.</p>
                  <div className="products-variant-grid">
                    {variantList.map(({ color, size, key }) => {
                      const row = form.rows[key] || form.rows[comboKey(null, null)] || {};
                      const label = [color, size].filter(Boolean).join(" / ") || "Default variant";
                      return (
                        <section className="products-variant-card" key={key} aria-label={`${label} pricing and stock`}>
                          <h3>{label}</h3>
                          <div className="products-variant-fields">
                            {hasOptions && <>
                              <label>Current amount *
                                <input type="number" min="0" step="0.01" value={row.price ?? ""} placeholder={form.colors.find((item) => item.name.trim() === color)?.price || form.price || "Enter amount"} onChange={(e) => updateRow(key, "price", e.target.value === "" ? undefined : e.target.value)} aria-label={`Current amount ${key}`} />
                              </label>
                            </>}
                            {hasOptions && <>
                              <label>Previous price
                                <input type="number" min="0" step="0.01" value={row.mrp ?? ""} placeholder={form.mrp || "Optional"} onChange={(e) => updateRow(key, "mrp", e.target.value === "" ? undefined : e.target.value)} aria-label={`Previous price ${key}`} />
                              </label>
                            </>}
                              {hasSizeOptions && <label>Stock quantity *
                                <input type="number" min="0" step="1" value={row.stock ?? ""} placeholder={form.stock || "0"} onChange={(e) => updateRow(key, "stock", e.target.value === "" ? undefined : e.target.value)} aria-label={`Stock ${key}`} />
                              </label>}
                              {hasSizeOptions && <label>Minimum stock
                                <input type="number" min="0" step="1" value={row.minStock ?? "0"} placeholder="0" onChange={(e) => updateRow(key, "minStock", e.target.value)} aria-label={`Minimum stock ${key}`} />
                              </label>}
                              <label>SKU
                                <input value={row.sku ?? ""} placeholder="Optional" onChange={(e) => updateRow(key, "sku", e.target.value)} aria-label={`SKU ${key}`} />
                              </label>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>}

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
                    <option value="">No badge</option>
                    {badgeOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                  {badgesError && <small role="alert">Could not load badges: {badgesError}</small>}
                </label>
                <section className="product-seo-panel products-form-full" aria-labelledby="product-seo-title">
                  <header className="product-seo-heading">
                    <div><h3 id="product-seo-title">SEO section</h3><p>Customize how this product appears in search results and when shared.</p></div>
                    <button type="button" className="table-action" onClick={generateProductSeo}>✦ Generate</button>
                  </header>
                  <div className="product-seo-fields">
                    <label className="products-form-field">Meta Title
                      <input maxLength={70} value={form.seo.title} onChange={(event) => updateSeoField("title", event.target.value)} placeholder="Meta Title" />
                      <small>{form.seo.title.length}/70 characters</small>
                    </label>
                    <label className="products-form-field">Meta Description
                      <textarea rows={4} maxLength={160} value={form.seo.description} onChange={(event) => updateSeoField("description", event.target.value)} placeholder="Write a short description for search engines" />
                      <small>{form.seo.description.length}/160 characters</small>
                    </label>
                    <div className="product-seo-image">
                      <ImageUpload
                        title="Meta Image (Ratio 2:1)"
                        images={form.seo.image ? [form.seo.image] : []}
                        multiple={false}
                        kind="seo"
                        size={IMAGE_SIZES.seoImage}
                        onChange={(images) => updateSeoField("image", images[0] || null)}
                      />
                      <label className="products-form-field product-seo-image-title">Meta Image Title
                        <input
                          maxLength={200}
                          value={form.seo.imageTitle}
                          onChange={(event) => updateSeoField("imageTitle", event.target.value)}
                          placeholder="Enter a title for the meta image"
                        />
                      </label>
                    </div>
                  </div>
                </section>
                <label className="products-form-field products-form-full">Description
                  <textarea rows={4} value={form.description} onChange={(e) => updateField("description", e.target.value)} placeholder="Enter product description" />
                </label>
              </div>
              <p className="form-hint">Products are saved to the database and appear on the storefront when enabled.</p>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowForm(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : editingId ? "Save Changes" : "Submit"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {bulkConfirm && <DeleteConfirmDialog
        title={`Delete ${Math.min(selectedIds.length, 200)} product${selectedIds.length === 1 ? "" : "s"}?`}
        message={`${Object.values(selected).slice(0, 5).map((name) => `“${name}”`).join(", ")}${selectedIds.length > 5 ? ` and ${selectedIds.length - 5} more` : ""} will be deleted. Products that appear in orders are archived instead.`}
        confirmLabel={`Yes, delete ${Math.min(selectedIds.length, 200)}`}
        onCancel={() => setBulkConfirm(false)}
        onConfirm={confirmBulkDelete}
      />}
      {deleting && <DeleteConfirmDialog title="Delete product?" message={`“${deleting.name}” will be deleted. Products that appear in orders are archived instead.`} onCancel={() => setDeleting(null)} onConfirm={confirmDeleteProduct} />}
    </>
  );
}
