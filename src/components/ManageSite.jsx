import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ManageSite.css";
import { adminRequest, uploadImage } from "../api/adminApi";
import { shortDate } from "../utils/format";
import EditIcon from "./EditIcon";
import StatusToggle from "./StatusToggle";

/* eslint-disable react/prop-types */
const sections = [
  { title: "General Settings", icon: "⚙" },
  { title: "Homepage Categories", icon: "◉" },
  { title: "Homepage Banners", icon: "▧" },
  { title: "Homepage Sections", icon: "▦" },
  { title: "Branding & Colors", icon: "◉" },
  { title: "Header & Footer", icon: "▤" },
  { title: "Announcement Bar", icon: "↗" },
  { title: "Popup Management", icon: "▣" },
  { title: "SEO Settings", icon: "⌕" },
  { title: "Pages & Policies", icon: "▥" },
  { title: "Contact & Social Links", icon: "◎" },
  { title: "Maintenance Mode", icon: "⏻" },
];

/* ---------- API ⇄ form mapping ---------- */
const toDateInput = (value) => (value ? String(new Date(value).toISOString()).slice(0, 10) : "");
const toLocalDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalDateTime = (value) => (value ? new Date(value).toISOString() : null);
const imageOut = (img) => (img?.url ? { url: img.url, publicId: img.publicId ?? null, alt: img.alt || "" } : null);
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

const POSITIONS = { top: "Top of page", "below-header": "Below header" };
const reverse = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));

const SETTINGS = {
  homeCategories: {
    toUi: (v) => ({ categories: v.categories || [], showAllCategories: v.showAllCategories ?? true, showNewIn: v.showNewIn ?? true, showDeals: v.showDeals ?? true }),
    toApi: (v) => ({ categories: v.categories, showAllCategories: v.showAllCategories, showNewIn: v.showNewIn, showDeals: v.showDeals }),
  },
  general: {
    toUi: (v) => ({ ...v, productsPerPage: String(v.productsPerPage), gridColumns: String(v.gridColumns) }),
    toApi: (v) => ({ ...pick(v, ["websiteName", "tagline", "websiteUrl", "currency", "language", "breadcrumbs", "wishlist", "comparison"]), productsPerPage: Number(v.productsPerPage), gridColumns: Number(v.gridColumns) }),
  },
  branding: {
    toUi: (v) => v,
    toApi: (v) => ({ ...pick(v, ["primaryColor", "secondaryColor", "accentColor", "font", "browserTitle", "metaDescription"]), logo: imageOut(v.logo), footerLogo: imageOut(v.footerLogo), favicon: imageOut(v.favicon) }),
  },
  headerFooter: {
    toUi: (v) => v,
    toApi: (v) => ({ ...pick(v, ["announcementVisible", "stickyHeader", "searchVisible", "wishlistVisible", "cartVisible", "accountVisible", "footerDescription", "contactEmail", "contactPhone", "address", "copyright", "socialIcons", "linkGroups"]), headerLogo: imageOut(v.headerLogo), footerLogo: imageOut(v.footerLogo) }),
  },
  announcement: {
    toUi: (v) => ({ ...v, text: (v.messages || []).join("\n"), position: POSITIONS[v.position] || POSITIONS.top, startDate: toDateInput(v.startDate), endDate: toDateInput(v.endDate) }),
    toApi: (v) => ({
      messages: v.text.split("\n").map((s) => s.trim()).filter(Boolean),
      ...pick(v, ["url", "background", "color", "enabled"]),
      position: reverse(POSITIONS)[v.position] || "top", startDate: v.startDate || null, endDate: v.endDate || null,
    }),
  },
  seo: {
    toUi: (v) => v,
    toApi: (v) => ({ ...pick(v, ["title", "description", "keywords", "canonical", "ogTitle", "ogDescription"]), shareImage: imageOut(v.shareImage) }),
  },
  contact: {
    toUi: (v) => v,
    toApi: (v) => ({ ...pick(v, ["email", "phone", "address", "hours", "instagram", "facebook", "youtube", "pinterest", "linkedin"]), whatsapp: String(v.whatsapp || "").replace(/\D/g, "") }),
  },
  maintenance: {
    toUi: (v) => ({ ...v, reopenAt: toLocalDateTime(v.reopenAt) }),
    toApi: (v) => ({ ...pick(v, ["enabled", "heading", "message", "showContact"]), illustration: imageOut(v.illustration), reopenAt: fromLocalDateTime(v.reopenAt) }),
  },
};

const PLACEMENTS = { hero: "Homepage hero", secondary: "Homepage secondary", strip: "Homepage strip" };
const TRIGGERS = { delay: "After 5 seconds", exit: "On exit intent", scroll: "On page scroll", immediate: "Immediately" };
const FREQUENCIES = { session: "Once per session", day: "Once per day", week: "Once per week", always: "Every visit" };
const PRODUCT_SOURCES = { new: "New arrivals", bestseller: "Bestsellers", trending: "Trending now", deals: "Biggest deals", featured: "Featured products", category: "From a category" };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const RECORDS = {
  banner: {
    path: "/admin/banners",
    toUi: (b) => ({
      id: b.id, title: b.title, subtitle: b.subtitle || "", kicker: b.kicker || "", image: b.image, mobileImage: b.mobileImage,
      placement: PLACEMENTS[b.placement] || PLACEMENTS.hero, order: b.order ?? 1, start: toDateInput(b.startsAt), end: toDateInput(b.endsAt),
      status: b.status === "active" ? (b.startsAt && new Date(b.startsAt) > new Date() ? "Scheduled" : "Active") : "Inactive",
      buttonText: b.buttonText || "", url: b.url || "",
    }),
    toApi: (v) => ({
      title: v.title.trim(), subtitle: v.subtitle.trim(), kicker: v.kicker.trim(), image: imageOut(v.image), mobileImage: imageOut(v.mobileImage),
      placement: reverse(PLACEMENTS)[v.placement] || "hero", order: Number(v.order) || 0, startsAt: v.start || null, endsAt: v.end || null,
      status: v.status === "Inactive" ? "inactive" : "active", buttonText: v.buttonText.trim(), url: v.url.trim(),
    }),
    toggle: (item) => ({ status: item.status === "Inactive" ? "active" : "inactive" }),
  },
  popup: {
    path: "/admin/popups",
    toUi: (p) => ({
      id: p.id, title: p.title, description: p.description || "", image: p.image, buttonText: p.buttonText || "", url: p.url || "",
      trigger: TRIGGERS[p.trigger] || TRIGGERS.delay, frequency: FREQUENCIES[p.frequency] || FREQUENCIES.session,
      start: toDateInput(p.startsAt), end: toDateInput(p.endsAt), status: p.status === "active" ? "Active" : "Inactive",
    }),
    toApi: (v) => ({
      title: v.title.trim(), description: v.description.trim(), image: imageOut(v.image), buttonText: v.buttonText.trim(), url: v.url.trim(),
      trigger: reverse(TRIGGERS)[v.trigger] || "delay", frequency: reverse(FREQUENCIES)[v.frequency] || "session",
      startsAt: v.start || null, endsAt: v.end || null, status: v.status === "Active" ? "active" : "inactive",
    }),
    toggle: (item) => ({ status: item.status === "Active" ? "inactive" : "active" }),
  },
  page: {
    path: "/admin/pages",
    toUi: (p) => ({
      id: p.id, title: p.title, slug: p.slug, description: p.description || "", content: p.content || "",
      seoTitle: p.seo?.title || "", metaDescription: p.seo?.description || "", status: p.status === "published" ? "Published" : "Draft",
      updated: shortDate(p.updatedAt),
    }),
    toApi: (v) => ({
      title: v.title.trim(), slug: v.slug.trim().toLowerCase(), description: v.description.trim(), content: v.content,
      seo: { title: v.seoTitle.trim(), description: v.metaDescription.trim() }, status: v.status === "Published" ? "published" : "draft",
    }),
    toggle: (item) => ({ status: item.status === "Published" ? "draft" : "published" }),
  },
  section: {
    path: "/admin/homepage-sections",
    toUi: (s) => ({
      id: s.id, title: s.title, subtitle: s.subtitle || "", type: s.type === "categories" ? "Categories" : "Products",
      source: s.source || "new", category: s.category || "", count: s.count ?? 8, order: s.order ?? 1,
      buttonText: s.buttonText || "", url: s.url || "", active: Boolean(s.active), layout: s.layout || "rail",
    }),
    toApi: (v) => {
      const type = v.type === "Categories" ? "categories" : "products";
      const source = type === "categories" ? "categories" : v.source === "categories" ? "new" : v.source;
      return {
        title: v.title.trim(), subtitle: v.subtitle.trim(), type, source,
        ...(source === "category" ? { category: v.category || null } : {}),
        count: Number(v.count) || 8, order: Number(v.order) || 0, buttonText: v.buttonText.trim(), url: v.url.trim(), active: Boolean(v.active),
      };
    },
    toggle: (item) => ({ active: !item.active }),
  },
};

const emptyRecord = {
  banner: { title: "", subtitle: "", kicker: "", image: null, mobileImage: null, placement: "Homepage hero", order: 1, start: "", end: "", status: "Active", buttonText: "", url: "" },
  popup: { title: "", description: "", image: null, buttonText: "", url: "", trigger: "After 5 seconds", frequency: "Once per session", start: "", end: "", status: "Active" },
  page: { title: "", slug: "", description: "", content: "", seoTitle: "", metaDescription: "", status: "Draft" },
  section: { title: "", subtitle: "", type: "Products", source: "new", category: "", count: 8, order: 1, buttonText: "View all", url: "", active: true },
};

function Field({ label, children, hint, className = "" }) {
  return <label className={`ms-field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Toggle({ label, checked, onChange, description }) {
  return (
    <div className="ms-toggle-row">
      <div><strong>{label}</strong>{description && <small>{description}</small>}</div>
      <button type="button" className={`ms-toggle ${checked ? "is-on" : ""}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}

function SettingsCard({ title, description, children, className = "" }) {
  return <section className={`ms-card ${className}`}><div className="ms-card-heading"><h2>{title}</h2>{description && <p>{description}</p>}</div>{children}</section>;
}

/* Uploads the chosen image to Cloudinary (via the API) and passes back { url, publicId }. */
function ImageUploader({ label, value, onChange, kind, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function readImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setError("Please select a PNG, JPG, WebP or GIF image.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await uploadImage(file, kind);
      onChange({ url: result.url, publicId: result.publicId, alt: "" });
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`ms-image-uploader ${compact ? "compact" : ""}`}>
      <span className="ms-image-label">{label}</span>
      <label className="ms-upload-box">
        {value?.url ? <img src={value.url} alt={`${label} preview`} /> : <span className="ms-upload-placeholder"><b>＋</b><span>{busy ? "Uploading…" : "Upload image"}</span><small>PNG, JPG or WebP</small></span>}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={readImage} aria-label={`Upload ${label}`} />
      </label>
      {error && <small className="ms-error">{error}</small>}
      {value?.url && <button type="button" className="ms-link-button" onClick={() => onChange(null)}>Remove image</button>}
    </div>
  );
}

function FormActions({ onReset, children = "Save Changes", saving = false }) {
  return <div className="ms-form-actions"><button type="button" className="ms-button ms-button-secondary" onClick={onReset} disabled={saving}>Reset</button><button type="submit" className="ms-button ms-button-primary" disabled={saving}>{saving ? "Saving…" : children}</button></div>;
}

function EntityStatus({ status }) {
  const active = ["Active", "Published"].includes(status);
  return <span className={`ms-status ${active ? "positive" : status === "Scheduled" ? "scheduled" : "inactive"}`}>{status}</span>;
}

function RecordModal({ kind, record, categories = [], onClose, onSave }) {
  const labels = { banner: "Banner", popup: "Popup", page: "Page", section: "Homepage section" };
  const [values, setValues] = useState({ ...emptyRecord[kind], ...record });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const title = labels[kind];
  useEffect(() => {
    dialogRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(values);
    } catch (saveError) {
      setError(saveError.message);
      setSaving(false);
    }
  }
  const urlHint = "Use a /path on your store or a full https:// link.";
  return (
    <div className="ms-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="ms-modal" role="dialog" aria-modal="true" aria-labelledby="ms-modal-title">
        <div className="ms-modal-heading"><div><p className="ms-eyebrow">{record?.id ? "EDIT" : "CREATE"}</p><h2 id="ms-modal-title">{record?.id ? `Edit ${title}` : `Add ${title}`}</h2></div><button type="button" className="ms-close" onClick={onClose} aria-label="Close dialog">×</button></div>
        <form onSubmit={submit}>
          {error && <p className="ms-error" role="alert">{error}</p>}
          <div className="ms-modal-grid">
            {kind === "banner" && <>
              <Field label="Banner title"><input required value={values.title} onChange={(e) => update("title", e.target.value)} /></Field>
              <Field label="Subtitle or description"><input value={values.subtitle} onChange={(e) => update("subtitle", e.target.value)} /></Field>
              <Field label="Small heading above the title"><input value={values.kicker} onChange={(e) => update("kicker", e.target.value)} maxLength={60} /></Field>
              <ImageUploader label="Desktop banner image" kind="banner" value={values.image} onChange={(value) => update("image", value)} />
              <ImageUploader label="Mobile banner image" kind="banner" value={values.mobileImage} onChange={(value) => update("mobileImage", value)} />
              <Field label="Button text"><input value={values.buttonText} onChange={(e) => update("buttonText", e.target.value)} /></Field>
              <Field label="Destination URL" hint={urlHint}><input value={values.url} onChange={(e) => update("url", e.target.value)} placeholder="https:// or /categories/..." /></Field>
              <Field label="Placement"><select value={values.placement} onChange={(e) => update("placement", e.target.value)}>{Object.values(PLACEMENTS).map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="Display order"><input type="number" min="0" value={values.order} onChange={(e) => update("order", e.target.value)} /></Field>
              <Field label="Start date"><input type="date" value={values.start} onChange={(e) => update("start", e.target.value)} /></Field>
              <Field label="End date"><input type="date" value={values.end} onChange={(e) => update("end", e.target.value)} /></Field>
              <Field label="Status" hint="Active banners with a future start date show as Scheduled."><select value={values.status === "Scheduled" ? "Active" : values.status} onChange={(e) => update("status", e.target.value)}><option>Active</option><option>Inactive</option></select></Field>
            </>}
            {kind === "popup" && <>
              <Field label="Popup title"><input required value={values.title} onChange={(e) => update("title", e.target.value)} /></Field>
              <Field label="Button text"><input value={values.buttonText} onChange={(e) => update("buttonText", e.target.value)} /></Field>
              <Field label="Popup description" className="full"><textarea rows="3" value={values.description} onChange={(e) => update("description", e.target.value)} /></Field>
              <ImageUploader label="Popup image" kind="popup" value={values.image} onChange={(value) => update("image", value)} />
              <div className="ms-preview-popup">{values.image?.url && <img src={values.image.url} alt="Popup preview" />}<strong>{values.title || "Popup preview"}</strong><p>{values.description || "Your message will appear here."}</p><span>{values.buttonText || "Button text"}</span></div>
              <Field label="Destination URL" hint={urlHint}><input value={values.url} onChange={(e) => update("url", e.target.value)} placeholder="https:// or /pages/..." /></Field>
              <Field label="Display trigger"><select value={values.trigger} onChange={(e) => update("trigger", e.target.value)}>{Object.values(TRIGGERS).map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Display frequency"><select value={values.frequency} onChange={(e) => update("frequency", e.target.value)}>{Object.values(FREQUENCIES).map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Start date"><input type="date" value={values.start} onChange={(e) => update("start", e.target.value)} /></Field>
              <Field label="End date"><input type="date" value={values.end} onChange={(e) => update("end", e.target.value)} /></Field>
              <Field label="Status"><select value={values.status} onChange={(e) => update("status", e.target.value)}><option>Active</option><option>Inactive</option></select></Field>
            </>}
            {kind === "page" && <>
              <Field label="Page title"><input required value={values.title} onChange={(e) => update("title", e.target.value)} /></Field>
              <Field label="Page slug" hint="Lowercase letters, numbers and hyphens."><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={values.slug} onChange={(e) => update("slug", e.target.value)} /></Field>
              <Field label="Short description" className="full"><textarea rows="2" value={values.description} onChange={(e) => update("description", e.target.value)} /></Field>
              <Field label="Page content" className="full"><textarea rows="7" value={values.content} onChange={(e) => update("content", e.target.value)} placeholder="Write page content…" /></Field>
              <Field label="SEO title"><input maxLength={70} value={values.seoTitle} onChange={(e) => update("seoTitle", e.target.value)} /></Field>
              <Field label="Meta description"><textarea rows="2" maxLength={160} value={values.metaDescription} onChange={(e) => update("metaDescription", e.target.value)} /></Field>
              <Field label="Status"><select value={values.status} onChange={(e) => update("status", e.target.value)}><option>Published</option><option>Draft</option></select></Field>
            </>}
            {kind === "section" && <>
              <Field label="Section title"><input required value={values.title} onChange={(e) => update("title", e.target.value)} /></Field>
              <Field label="Subtitle"><input value={values.subtitle} onChange={(e) => update("subtitle", e.target.value)} /></Field>
              <Field label="Section type"><select value={values.type} onChange={(e) => update("type", e.target.value)}><option>Products</option><option>Categories</option></select></Field>
              {values.type === "Products"
                ? <Field label="Products to show"><select value={values.source} onChange={(e) => update("source", e.target.value)}>{Object.entries(PRODUCT_SOURCES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
                : <Field label="Categories to show" hint="Shows your enabled top-level categories."><input value="Top-level categories" disabled /></Field>}
              {values.type === "Products" && values.source === "category" && (
                <Field label="Category"><select required value={values.category} onChange={(e) => update("category", e.target.value)}><option value="">Choose a category</option>{categories.map((c) => <option key={c.id} value={c.id}>{"— ".repeat(c.level - 1)}{c.name}</option>)}</select></Field>
              )}
              <Field label="Number of items"><input type="number" min="1" max="24" value={values.count} onChange={(e) => update("count", e.target.value)} /></Field>
              <Field label="Display order"><input type="number" min="0" value={values.order} onChange={(e) => update("order", e.target.value)} /></Field>
              <Field label="View All button text"><input value={values.buttonText} onChange={(e) => update("buttonText", e.target.value)} /></Field>
              <Field label="View All URL" hint={urlHint}><input value={values.url} onChange={(e) => update("url", e.target.value)} /></Field>
              <Toggle label="Section active" checked={values.active} onChange={(value) => update("active", value)} />
            </>}
          </div>
          <div className="ms-form-actions"><button type="button" className="ms-button ms-button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="ms-button ms-button-primary" disabled={saving}>{saving ? "Saving…" : `Save ${title}`}</button></div>
        </form>
      </section>
    </div>
  );
}

function SettingsForm({ initial, children, onSave, onReset }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  useEffect(() => { setValues(initial); }, [initial]);
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(values);
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    if (!window.confirm("Reset these settings to their defaults?")) return;
    setSaving(true);
    try {
      await onReset();
    } finally {
      setSaving(false);
    }
  }
  return <form onSubmit={submit}>{children(values, update)}<FormActions onReset={reset} saving={saving} /></form>;
}

export default function ManageSite({ activeSection = "General Settings", onSectionChange, categories = [] }) {
  const [settings, setSettings] = useState(null);
  const [banners, setBanners] = useState([]);
  const [popups, setPopups] = useState([]);
  const [pages, setPages] = useState([]);
  const [homepageSections, setHomepageSections] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modal, setModal] = useState(null);
  const [urlFeedback, setUrlFeedback] = useState("");
  const [pendingToggleIds, setPendingToggleIds] = useState([]);

  const setters = { banner: setBanners, popup: setPopups, page: setPages, section: setHomepageSections };

  const loadRecords = useCallback(async (kind) => {
    const result = await adminRequest(`${RECORDS[kind].path}?limit=100`);
    setters[kind](result.data.map(RECORDS[kind].toUi));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminRequest("/admin/site-settings").then((result) => {
        if (active) setSettings(Object.fromEntries(Object.entries(SETTINGS).map(([key, map]) => [key, map.toUi(result.data[key])])));
      }),
      ...Object.keys(RECORDS).map(loadRecords),
    ]).catch((error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, [loadRecords]);

  function notify(message = "Changes saved successfully.") {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }
  async function saveSettings(key, value) {
    try {
      const result = await adminRequest(`/admin/site-settings/${key}`, { method: "PATCH", body: JSON.stringify(SETTINGS[key].toApi(value)) });
      setSettings((current) => ({ ...current, [key]: SETTINGS[key].toUi(result.data) }));
      notify();
    } catch (error) {
      notify(`Not saved: ${error.message}`);
    }
  }
  async function resetSettings(key) {
    try {
      const result = await adminRequest(`/admin/site-settings/${key}/reset`, { method: "POST" });
      setSettings((current) => ({ ...current, [key]: SETTINGS[key].toUi(result.data) }));
      notify("Settings reset to defaults.");
    } catch (error) {
      notify(`Not reset: ${error.message}`);
    }
  }
  async function saveRecord(kind, record) {
    const body = JSON.stringify(RECORDS[kind].toApi(record));
    if (record.id) await adminRequest(`${RECORDS[kind].path}/${record.id}`, { method: "PATCH", body });
    else await adminRequest(RECORDS[kind].path, { method: "POST", body });
    await loadRecords(kind);
    setModal(null);
    notify(`${kind === "page" ? "Page" : kind === "section" ? "Section" : kind === "popup" ? "Popup" : "Banner"} saved.`);
  }
  async function removeRecord(kind, record) {
    if (!window.confirm(`Delete "${record.title}"? This action cannot be undone.`)) return;
    try {
      await adminRequest(`${RECORDS[kind].path}/${record.id}`, { method: "DELETE" });
      await loadRecords(kind);
      notify("Item deleted.");
    } catch (error) {
      notify(`Not deleted: ${error.message}`);
    }
  }
  async function toggleRecord(kind, record) {
    const pendingId = `${kind}:${record.id}`;
    const apiChanges = RECORDS[kind].toggle(record);
    const uiChanges = kind === "section"
      ? apiChanges
      : {
        status: kind === "page"
          ? apiChanges.status === "published" ? "Published" : "Draft"
          : kind === "banner" && apiChanges.status === "active" && record.start && new Date(record.start) > new Date()
            ? "Scheduled"
            : apiChanges.status === "active" ? "Active" : "Inactive",
      };
    const updateRecord = (changes) => setters[kind]((current) => current.map((item) => (
      item.id === record.id ? { ...item, ...changes } : item
    )));
    updateRecord(uiChanges);
    setPendingToggleIds((current) => [...current, pendingId]);
    try {
      await adminRequest(`${RECORDS[kind].path}/${record.id}`, { method: "PATCH", body: JSON.stringify(apiChanges) });
    } catch (error) {
      updateRecord(kind === "section" ? { active: record.active } : { status: record.status });
      notify(`Not updated: ${error.message}`);
    } finally {
      setPendingToggleIds((current) => current.filter((id) => id !== pendingId));
    }
  }
  const visibleBanners = useMemo(() => banners.filter((item) =>
    (!search || `${item.title} ${item.placement}`.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === "All" || item.status === statusFilter)), [banners, search, statusFilter]);
  const visiblePopups = useMemo(() => popups.filter((item) =>
    (!search || `${item.title} ${item.description}`.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === "All" || item.status === statusFilter)), [popups, search, statusFilter]);
  const visiblePages = useMemo(() => pages.filter((item) =>
    (!search || `${item.title} ${item.slug}`.toLowerCase().includes(search.toLowerCase())) &&
    (statusFilter === "All" || item.status === statusFilter)), [pages, search, statusFilter]);

  function renderHomeCategories() {
    const topCategories = categories.filter((category) => category.level === 1 && category.status === "enabled");
    return <SettingsForm initial={settings.homeCategories} onSave={(value) => saveSettings("homeCategories", value)} onReset={() => resetSettings("homeCategories")}>
      {(values, update) => <>
        <SettingsCard title="Homepage category strip" description="Choose the circular category links shown near the top of the customer storefront. Category names and uploaded images come from Category Management.">
          <div className="ms-toggle-list">
            <Toggle label="Show all active top-level categories" checked={values.showAllCategories} onChange={(value) => update("showAllCategories", value)} description="When enabled, categories follow their order in Category Management." />
          </div>
          {!values.showAllCategories && <div className="ms-form-grid">
            <div className="ms-category-picker full">
              <strong>Select categories</strong>
              <p>Selected categories appear in the order listed below. Upload or change their circle images in Category Management.</p>
              <div className="ms-category-options">
                {topCategories.map((category) => <label key={category.id}>
                  <input type="checkbox" checked={values.categories.includes(category.slug)} onChange={(event) => {
                    const next = event.target.checked
                      ? [...values.categories, category.slug]
                      : values.categories.filter((slug) => slug !== category.slug);
                    update("categories", next);
                  }} />
                  {category.name}
                </label>)}
                {!topCategories.length && <small>No top-level categories are available yet. Add them in Category Management first.</small>}
              </div>
              {!!values.categories.length && <ol className="ms-category-order">
                {values.categories.map((slug, index) => {
                  const category = topCategories.find((item) => item.slug === slug);
                  if (!category) return null;
                  return <li key={slug}><span>{category.name}</span><div>
                    <button type="button" aria-label={`Move ${category.name} up`} disabled={index === 0} onClick={() => {
                      const next = [...values.categories];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      update("categories", next);
                    }}>↑</button>
                    <button type="button" aria-label={`Move ${category.name} down`} disabled={index === values.categories.length - 1} onClick={() => {
                      const next = [...values.categories];
                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                      update("categories", next);
                    }}>↓</button>
                  </div></li>;
                })}
              </ol>}
            </div>
          </div>}
          <div className="ms-toggle-list">
            <Toggle label="Show New in shortcut" checked={values.showNewIn} onChange={(value) => update("showNewIn", value)} />
            <Toggle label="Show Deals shortcut" checked={values.showDeals} onChange={(value) => update("showDeals", value)} />
          </div>
        </SettingsCard>
      </>}
    </SettingsForm>;
  }

  function renderGeneral() {
    return <SettingsForm initial={settings.general} onSave={(value) => saveSettings("general", value)} onReset={() => resetSettings("general")}>
      {(values, update) => <SettingsCard title="Store information" description="Set the details and storefront defaults customers will see.">
        <div className="ms-form-grid">
          <Field label="Website name"><input required value={values.websiteName} onChange={(e) => update("websiteName", e.target.value)} /></Field>
          <Field label="Website tagline"><input value={values.tagline} onChange={(e) => update("tagline", e.target.value)} /></Field>
          <Field label="Website URL"><input type="url" value={values.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} /></Field>
          <Field label="Default currency"><select value={values.currency} onChange={(e) => update("currency", e.target.value)}><option>INR</option></select></Field>
          <Field label="Default language"><select value={values.language} onChange={(e) => update("language", e.target.value)}><option>English</option></select></Field>
          <Field label="Products per page"><select value={values.productsPerPage} onChange={(e) => update("productsPerPage", e.target.value)}>{["12", "24", "36", "48"].map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Product grid columns"><select value={values.gridColumns} onChange={(e) => update("gridColumns", e.target.value)}>{["2", "3", "4", "5", "6"].map((item) => <option key={item}>{item}</option>)}</select></Field>
        </div>
        <div className="ms-toggle-list">
          <Toggle label="Show breadcrumbs" checked={values.breadcrumbs} onChange={(value) => update("breadcrumbs", value)} />
          <Toggle label="Show wishlist" checked={values.wishlist} onChange={(value) => update("wishlist", value)} />
          <Toggle label="Show product comparison" checked={values.comparison} onChange={(value) => update("comparison", value)} />
        </div>
      </SettingsCard>}
    </SettingsForm>;
  }

  function renderBanners() {
    return <RecordList kind="banner" title="Homepage banners" description="Manage promotional artwork and placements on your storefront." records={visibleBanners} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onAdd={() => setModal({ kind: "banner" })} onEdit={(item) => setModal({ kind: "banner", record: item })} onDelete={(item) => removeRecord("banner", item)} onToggle={(item) => toggleRecord("banner", item)} pendingToggleIds={pendingToggleIds} />;
  }
  function renderPopups() {
    return <RecordList kind="popup" title="Popup management" description="Control promotional messages and when they appear to shoppers." records={visiblePopups} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onAdd={() => setModal({ kind: "popup" })} onEdit={(item) => setModal({ kind: "popup", record: item })} onDelete={(item) => removeRecord("popup", item)} onToggle={(item) => toggleRecord("popup", item)} pendingToggleIds={pendingToggleIds} />;
  }
  function renderPages() {
    return <RecordList kind="page" title="Pages & policies" description="Keep your store information and policies up to date." records={visiblePages} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onAdd={() => setModal({ kind: "page" })} onEdit={(item) => setModal({ kind: "page", record: item })} onDelete={(item) => removeRecord("page", item)} onToggle={(item) => toggleRecord("page", item)} pendingToggleIds={pendingToggleIds} />;
  }
  const sourceLabel = (item) => item.type === "Categories" ? "Top-level categories"
    : item.source === "category" ? `Category: ${categories.find((c) => c.id === item.category)?.name || "not selected"}`
      : PRODUCT_SOURCES[item.source] || cap(item.source);
  function renderSections() {
    return <SettingsCard title="Homepage sections" description="Choose what appears on the homepage and arrange the storefront experience.">
      <div className="ms-sections-list">{homepageSections.slice().sort((a, b) => Number(a.order) - Number(b.order)).map((item, index, list) => <article className="ms-section-row" key={item.id}>
        <div className="ms-reorder"><button type="button" aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => moveSection(item, -1, list)}>↑</button><button type="button" aria-label={`Move ${item.title} down`} disabled={index === list.length - 1} onClick={() => moveSection(item, 1, list)}>↓</button></div>
        <div className="ms-section-main"><div className="ms-section-title"><strong>{item.title}</strong><EntityStatus status={item.active ? "Active" : "Inactive"} /></div><p>{item.subtitle || "No subtitle"} · {item.type} · {item.count} items</p><small>Shows: {sourceLabel(item)} · Order {item.order}</small></div>
        <div className="ms-row-actions"><button type="button" className="ms-edit-icon-button" aria-label={`Edit ${item.title}`} title={`Edit ${item.title}`} onClick={() => setModal({ kind: "section", record: item })}><EditIcon /></button><StatusToggle checked={item.active} label={`${item.active ? "Disable" : "Enable"} ${item.title}`} onChange={() => toggleRecord("section", item)} disabled={pendingToggleIds.includes(`section:${item.id}`)} /><button type="button" className="danger" onClick={() => removeRecord("section", item)}>Delete</button></div>
      </article>)}
      {!homepageSections.length && <div className="ms-empty"><strong>No homepage sections yet</strong></div>}</div>
      <button type="button" className="ms-button ms-button-secondary ms-add-section" onClick={() => setModal({ kind: "section", record: { order: homepageSections.length + 1 } })}>＋ Add homepage section</button>
    </SettingsCard>;
  }
  async function moveSection(item, direction, ordered) {
    const index = ordered.findIndex((entry) => entry.id === item.id);
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const ids = ordered.map((entry) => entry.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      const result = await adminRequest("/admin/homepage-sections/order", { method: "PUT", body: JSON.stringify({ ids }) });
      setHomepageSections(result.data.map(RECORDS.section.toUi));
    } catch (error) {
      notify(`Not reordered: ${error.message}`);
    }
  }

  function renderBranding() {
    return <SettingsForm initial={settings.branding} onSave={(value) => saveSettings("branding", value)} onReset={() => resetSettings("branding")}>
      {(values, update) => <><SettingsCard title="Store identity" description="Upload your brand assets and set your visual identity."><div className="ms-image-row">
        <ImageUploader label="Website logo" kind="logo" value={values.logo} onChange={(value) => update("logo", value)} />
        <ImageUploader label="Footer logo" kind="logo" value={values.footerLogo} onChange={(value) => update("footerLogo", value)} />
        <ImageUploader label="Favicon" kind="favicon" compact value={values.favicon} onChange={(value) => update("favicon", value)} />
      </div></SettingsCard>
      <SettingsCard title="Colors & typography" description="Keep your storefront colors and font consistent."><div className="ms-form-grid">
        {[["primaryColor", "Primary color"], ["secondaryColor", "Secondary color"], ["accentColor", "Accent color"]].map(([key, label]) => <Field label={label} key={key}><div className="ms-color-field"><input type="color" value={values[key]} onChange={(e) => update(key, e.target.value.toUpperCase())} /><span>{values[key]}</span><i style={{ backgroundColor: values[key] }} /></div></Field>)}
        <Field label="Font selection"><select value={values.font} onChange={(e) => update("font", e.target.value)}>{["Plus Jakarta Sans", "Inter", "System UI", "Roboto", "Lato", "Poppins"].map((font) => <option key={font}>{font}</option>)}</select></Field>
        <Field label="Browser tab title"><input maxLength="70" value={values.browserTitle} onChange={(e) => update("browserTitle", e.target.value)} /></Field>
        <Field label="Meta description" className="full"><textarea rows="3" maxLength="160" value={values.metaDescription} onChange={(e) => update("metaDescription", e.target.value)} /><small>{values.metaDescription.length}/160 characters</small></Field>
      </div></SettingsCard></>}
    </SettingsForm>;
  }

  function renderHeaderFooter() {
    return <SettingsForm initial={settings.headerFooter} onSave={(value) => saveSettings("headerFooter", value)} onReset={() => resetSettings("headerFooter")}>
      {(values, update) => <><SettingsCard title="Header" description="Configure the storefront header and customer shortcuts."><div className="ms-image-row"><ImageUploader label="Header logo" kind="logo" compact value={values.headerLogo} onChange={(value) => update("headerLogo", value)} /></div><div className="ms-toggle-list">
        {["announcementVisible", "stickyHeader", "searchVisible", "wishlistVisible", "cartVisible", "accountVisible"].map((key) => <Toggle key={key} label={{ announcementVisible: "Show announcement bar", stickyHeader: "Sticky header", searchVisible: "Show search bar", wishlistVisible: "Show wishlist icon", cartVisible: "Show cart icon", accountVisible: "Show account icon" }[key]} checked={values[key]} onChange={(value) => update(key, value)} />)}
      </div></SettingsCard>
      <SettingsCard title="Footer" description="Add helpful store information and links to your footer."><div className="ms-form-grid">
        <Field label="Footer description" className="full"><textarea rows="3" value={values.footerDescription} onChange={(e) => update("footerDescription", e.target.value)} /></Field>
        <Field label="Contact email"><input type="email" value={values.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} /></Field>
        <Field label="Contact phone"><input value={values.contactPhone} onChange={(e) => update("contactPhone", e.target.value)} /></Field>
        <Field label="Business address" className="full"><textarea rows="2" value={values.address} onChange={(e) => update("address", e.target.value)} /></Field>
        <Field label="Copyright text" className="full"><input value={values.copyright} onChange={(e) => update("copyright", e.target.value)} /></Field>
        <Field label="Footer link groups" className="full" hint="Separate links with commas."><input value={values.linkGroups} onChange={(e) => update("linkGroups", e.target.value)} /></Field>
      </div><div className="ms-image-row"><ImageUploader label="Footer logo" kind="logo" compact value={values.footerLogo} onChange={(value) => update("footerLogo", value)} /></div><div className="ms-toggle-list"><Toggle label="Show social media icons" checked={values.socialIcons} onChange={(value) => update("socialIcons", value)} /></div></SettingsCard></>}
    </SettingsForm>;
  }

  function renderAnnouncement() {
    return <SettingsForm initial={settings.announcement} onSave={(value) => saveSettings("announcement", value)} onReset={() => resetSettings("announcement")}>
      {(values, update) => <><SettingsCard title="Announcement bar" description="Share a timely offer or update at the top of your storefront."><div className="ms-form-grid">
        <Field label="Announcement text" className="full" hint="One message per line (up to 8); they rotate in the ticker."><textarea required rows="4" value={values.text} onChange={(e) => update("text", e.target.value)} /></Field>
        <Field label="Optional destination URL" hint="A /path on your store or a full https:// link."><input value={values.url} onChange={(e) => update("url", e.target.value)} placeholder="https:// or /categories/..." /></Field>
        <Field label="Display position"><select value={values.position} onChange={(e) => update("position", e.target.value)}>{Object.values(POSITIONS).map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="Background color"><div className="ms-color-field"><input type="color" value={values.background} onChange={(e) => update("background", e.target.value.toUpperCase())} /><span>{values.background}</span></div></Field>
        <Field label="Text color"><div className="ms-color-field"><input type="color" value={values.color} onChange={(e) => update("color", e.target.value.toUpperCase())} /><span>{values.color}</span></div></Field>
        <Field label="Start date"><input type="date" value={values.startDate} onChange={(e) => update("startDate", e.target.value)} /></Field>
        <Field label="End date"><input type="date" value={values.endDate} onChange={(e) => update("endDate", e.target.value)} /></Field>
      </div><div className="ms-toggle-list"><Toggle label="Enable announcement bar" checked={values.enabled} onChange={(value) => update("enabled", value)} /></div></SettingsCard>
      <SettingsCard title="Live preview" description="Preview updates as you edit."><div className="ms-announcement-preview" style={{ background: values.background, color: values.color }}>{values.text.split("\n")[0] || "Your announcement will appear here"}</div></SettingsCard></>}
    </SettingsForm>;
  }

  function renderSeo() {
    return <SettingsForm initial={settings.seo} onSave={(value) => saveSettings("seo", value)} onReset={() => resetSettings("seo")}>
      {(values, update) => <><SettingsCard title="Search engine optimization" description="Improve how your store appears in search and social sharing."><div className="ms-form-grid">
        <Field label="Homepage SEO title" className="full"><input maxLength="70" value={values.title} onChange={(e) => update("title", e.target.value)} /><small>{values.title.length}/70 characters</small></Field>
        <Field label="Meta description" className="full"><textarea rows="4" maxLength="160" value={values.description} onChange={(e) => update("description", e.target.value)} /><small>{values.description.length}/160 characters</small></Field>
        <Field label="Keywords" className="full"><input value={values.keywords} onChange={(e) => update("keywords", e.target.value)} placeholder="Comma-separated keywords" /></Field>
        <Field label="Canonical URL"><input type="url" value={values.canonical} onChange={(e) => update("canonical", e.target.value)} /></Field>
        <Field label="Open Graph title"><input maxLength="90" value={values.ogTitle} onChange={(e) => update("ogTitle", e.target.value)} /></Field>
        <Field label="Open Graph description" className="full"><textarea rows="3" maxLength="200" value={values.ogDescription} onChange={(e) => update("ogDescription", e.target.value)} /></Field>
        <ImageUploader label="Social sharing image" kind="seo" value={values.shareImage} onChange={(value) => update("shareImage", value)} />
      </div></SettingsCard>
      <SettingsCard title="Search result preview" description="A preview of how your homepage may appear in search results."><div className="ms-search-preview"><small>{values.canonical || "https://shoponzy.in"}</small><strong>{values.title || "Homepage title"}</strong><p>{values.description || "Your page description will appear here."}</p></div></SettingsCard></>}
    </SettingsForm>;
  }

  function renderContact() {
    const urls = ["instagram", "facebook", "youtube", "pinterest", "linkedin"];
    const labels = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", pinterest: "Pinterest", linkedin: "LinkedIn" };
    return <SettingsForm initial={settings.contact} onSave={(value) => saveSettings("contact", value)} onReset={() => resetSettings("contact")}>
      {(values, update) => <><SettingsCard title="Support information" description="Let customers know how to reach your team."><div className="ms-form-grid">
        <Field label="Support email"><input type="email" value={values.email} onChange={(e) => update("email", e.target.value)} /></Field>
        <Field label="Customer support phone"><input type="tel" value={values.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
        <Field label="WhatsApp number" hint="Digits only, with country code, e.g. 919876543210."><input type="tel" value={values.whatsapp} onChange={(e) => update("whatsapp", e.target.value)} /></Field>
        <Field label="Support hours"><input value={values.hours} onChange={(e) => update("hours", e.target.value)} /></Field>
        <Field label="Business address" className="full"><textarea rows="3" value={values.address} onChange={(e) => update("address", e.target.value)} /></Field>
      </div></SettingsCard>
      <SettingsCard title="Social links" description="Add your official social profiles."><div className="ms-form-grid">{urls.map((key) => <Field key={key} label={`${{ instagram: "◎", facebook: "f", youtube: "▶", pinterest: "℗", linkedin: "in" }[key]}  ${labels[key]} URL`}><input type="url" value={values[key]} onChange={(e) => { update(key, e.target.value); setUrlFeedback(e.target.value && !e.target.validity.valid ? `Enter a valid ${labels[key]} URL.` : ""); }} placeholder="https://" />{values[key] && <small className={urlFeedback ? "ms-error" : "ms-valid"}>{urlFeedback || "Valid URL format"}</small>}</Field>)}</div></SettingsCard></>}
    </SettingsForm>;
  }

  function renderMaintenance() {
    return <SettingsForm initial={settings.maintenance} onSave={(value) => saveSettings("maintenance", value)} onReset={() => resetSettings("maintenance")}>
      {(values, update) => <><SettingsCard title="Maintenance mode" description="Temporarily pause storefront access while you make updates."><div className="ms-toggle-list"><Toggle label="Enable maintenance mode" description="Visitors will see the maintenance page instead of your storefront." checked={values.enabled} onChange={(value) => update("enabled", value)} /></div><div className="ms-form-grid">
        <Field label="Maintenance page heading"><input value={values.heading} onChange={(e) => update("heading", e.target.value)} /></Field>
        <Field label="Estimated reopening date and time"><input type="datetime-local" value={values.reopenAt} onChange={(e) => update("reopenAt", e.target.value)} /></Field>
        <Field label="Maintenance message" className="full"><textarea rows="4" value={values.message} onChange={(e) => update("message", e.target.value)} /></Field>
        <ImageUploader label="Optional illustration" kind="maintenance" value={values.illustration} onChange={(value) => update("illustration", value)} />
      </div><div className="ms-toggle-list"><Toggle label="Show contact/support information" checked={values.showContact} onChange={(value) => update("showContact", value)} /></div></SettingsCard>
      <SettingsCard title="Maintenance page preview"><div className="ms-maintenance-preview">{values.illustration?.url && <img src={values.illustration.url} alt="Maintenance illustration" />}<span className="ms-maintenance-icon">⌁</span><h3>{values.heading}</h3><p>{values.message}</p><small>{values.reopenAt ? `Expected back ${new Date(values.reopenAt).toLocaleString()}` : "We’ll be back soon."}</small>{values.showContact && settings.contact?.email && <a href={`mailto:${settings.contact.email}`}>{settings.contact.email}</a>}</div></SettingsCard></>}
    </SettingsForm>;
  }

  const content = {
    "General Settings": renderGeneral,
    "Homepage Categories": renderHomeCategories,
    "Homepage Banners": renderBanners,
    "Homepage Sections": renderSections,
    "Branding & Colors": renderBranding,
    "Header & Footer": renderHeaderFooter,
    "Announcement Bar": renderAnnouncement,
    "Popup Management": renderPopups,
    "SEO Settings": renderSeo,
    "Pages & Policies": renderPages,
    "Contact & Social Links": renderContact,
    "Maintenance Mode": renderMaintenance,
  }[activeSection] || renderGeneral;

  return (
    <div className="manage-site">
      <div className="page-heading ms-page-heading">
        <div><p className="eyebrow">STOREFRONT</p><h1>{activeSection}</h1><p className="muted">Manage the experience and content your customers see.</p></div>
        <span className="ms-preview-chip"><span /> Saved to the live storefront</span>
      </div>
      <div className="ms-tabs" role="tablist" aria-label="Manage Site sections">
        {sections.map((section) => <button type="button" role="tab" aria-selected={activeSection === section.title} key={section.title} className={activeSection === section.title ? "active" : ""} onClick={() => { setSearch(""); setStatusFilter("All"); onSectionChange(section.title); }}><span>{section.icon}</span>{section.title}</button>)}
      </div>
      {loadError && <p className="ms-error" role="alert">{loadError}</p>}
      {/* Keyed by section so each settings form starts from its own values. */}
      <div className="ms-content" key={activeSection}>{settings ? content() : !loadError && <p className="muted" role="status">Loading…</p>}</div>
      {modal && <RecordModal key={`${modal.kind}-${modal.record?.id || "new"}`} kind={modal.kind} record={modal.record} categories={categories} onClose={() => setModal(null)} onSave={(value) => saveRecord(modal.kind, value)} />}
      {toast && <div className="ms-toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}

function RecordList({ kind, title, description, records, search, setSearch, statusFilter, setStatusFilter, onAdd, onEdit, onDelete, onToggle, pendingToggleIds }) {
  const pageMode = kind === "page";
  const popupMode = kind === "popup";
  const statusOptions = pageMode ? ["All", "Published", "Draft"] : ["All", "Active", "Inactive", ...(kind === "banner" ? ["Scheduled"] : [])];
  const emptyLabel = kind === "page" ? "No pages found" : kind === "popup" ? "No popups found" : "No banners found";
  return <section className="ms-card ms-record-card">
    <div className="ms-record-heading"><div className="ms-card-heading"><h2>{title}</h2><p>{description}</p></div><button type="button" className="ms-button ms-button-primary" onClick={onAdd}>＋ Add {pageMode ? "Page" : popupMode ? "Popup" : "Banner"}</button></div>
    <div className="ms-record-controls"><label className="ms-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${pageMode ? "pages" : popupMode ? "popups" : "banners"}…`} aria-label="Search records" /></label><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></div>
    <div className="ms-table-wrap"><table className="ms-table"><thead><tr>{kind === "banner" ? <><th>Banner</th><th>Placement</th><th>Order</th><th>Start date</th><th>End date</th><th>Status</th><th>Actions</th></> : pageMode ? <><th>Page title</th><th>Page slug</th><th>Last updated</th><th>Status</th><th>Actions</th></> : <><th>Popup</th><th>Trigger</th><th>Frequency</th><th>Start date</th><th>End date</th><th>Status</th><th>Actions</th></>}</tr></thead>
      <tbody>{records.map((item) => <tr key={item.id}>
        {kind === "banner" ? <><td><div className="ms-record-title">{item.image?.url ? <img src={item.image.url} alt="" /> : <div className="ms-thumb-placeholder">▧</div>}<div><strong>{item.title}</strong><small>{item.subtitle}</small></div></div></td><td>{item.placement}</td><td>{item.order}</td><td>{item.start || "—"}</td><td>{item.end || "—"}</td><td><EntityStatus status={item.status || "Inactive"} /></td></>
          : pageMode ? <><td><strong>{item.title}</strong></td><td className="ms-slug">/{item.slug}</td><td>{item.updated}</td><td><EntityStatus status={item.status} /></td></>
            : <><td><div className="ms-record-title">{item.image?.url ? <img src={item.image.url} alt="" /> : <div className="ms-thumb-placeholder">▣</div>}<div><strong>{item.title}</strong><small>{item.description}</small></div></div></td><td>{item.trigger}</td><td>{item.frequency}</td><td>{item.start || "—"}</td><td>{item.end || "—"}</td><td><EntityStatus status={item.status} /></td></>}
        <td><div className="ms-row-actions"><button type="button" className="ms-edit-icon-button" aria-label={`Edit ${item.title}`} title={`Edit ${item.title}`} onClick={() => onEdit(item)}><EditIcon /></button><StatusToggle checked={pageMode ? item.status === "Published" : item.status !== "Inactive"} label={pageMode ? `${item.status === "Published" ? "Unpublish" : "Publish"} ${item.title}` : `${item.status === "Inactive" ? "Enable" : "Disable"} ${item.title}`} onChange={() => onToggle(item)} disabled={pendingToggleIds.includes(`${kind}:${item.id}`)} /><button type="button" className="danger" onClick={() => onDelete(item)}>Delete</button></div></td>
      </tr>)}
      {!records.length && <tr><td colSpan={kind === "banner" ? 7 : pageMode ? 5 : 7}><div className="ms-empty"><span>⌕</span><strong>{emptyLabel}</strong><small>Try changing your search or filters, or add a new item.</small></div></td></tr>}
      </tbody></table></div>
  </section>;
}
