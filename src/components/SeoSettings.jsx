import { useCallback, useEffect, useState } from "react";
import { adminRequest, uploadImage } from "../api/adminApi";
import { API_BASE } from "../api/config";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import "./SeoSettings.css";

/* eslint-disable react/prop-types */
const TABS = ["Webmaster Tools", "Robots.txt", "Sitemap", "Robots Meta Content", "404 Logs"];
const ROBOTS_OPTIONS = ["index, follow", "noindex, follow", "index, nofollow", "noindex, nofollow"];
const DEFAULTS = {
  title: "", description: "", keywords: "", canonical: "", ogTitle: "", ogDescription: "", shareImage: null,
  googleVerification: "", bingVerification: "", baiduVerification: "", yandexVerification: "",
  robotsTxt: "", robotsMeta: "index, follow", sitemapXml: "",
};
const DEFAULT_ROBOTS = (base) => `User-agent: *\nDisallow: /cart\nDisallow: /checkout\nDisallow: /account\nDisallow: /reset-password\nAllow: /\n\nSitemap: ${base.replace(/\/$/, "")}/sitemap.xml`;

function SeoField({ label, hint, children }) {
  return <label className="seo-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function SeoCard({ title, description, children, action }) {
  return <section className="seo-card">
    <header className="seo-card-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>
    {children}
  </section>;
}

function ErrorMessage({ children }) {
  return children ? <p className="seo-error" role="alert">{children}</p> : null;
}

function parseRobotsMeta(value = "index, follow") {
  const directives = value.split(",").map((directive) => directive.trim().toLowerCase());
  const directiveValue = (name, fallback) => directives.find((item) => item.startsWith(`${name}:`))?.slice(name.length + 1) ?? fallback;
  return {
    index: !directives.includes("noindex"),
    noFollow: directives.includes("nofollow"),
    noArchive: directives.includes("noarchive"),
    noImageIndex: directives.includes("noimageindex"),
    noSnippet: directives.includes("nosnippet"),
    maxSnippetEnabled: directives.some((item) => item.startsWith("max-snippet:")),
    maxSnippet: directiveValue("max-snippet", "-1"),
    maxVideoPreviewEnabled: directives.some((item) => item.startsWith("max-video-preview:")),
    maxVideoPreview: directiveValue("max-video-preview", "-1"),
    maxImagePreviewEnabled: directives.some((item) => item.startsWith("max-image-preview:")),
    maxImagePreview: directiveValue("max-image-preview", "large"),
  };
}

function formatRobotsMeta(options) {
  return [
    options.index ? "index" : "noindex",
    options.noFollow ? "nofollow" : "follow",
    options.noArchive && "noarchive",
    options.noImageIndex && "noimageindex",
    options.noSnippet && "nosnippet",
    options.maxSnippetEnabled && `max-snippet:${options.maxSnippet}`,
    options.maxVideoPreviewEnabled && `max-video-preview:${options.maxVideoPreview}`,
    options.maxImagePreviewEnabled && `max-image-preview:${options.maxImagePreview}`,
  ].filter(Boolean).join(", ");
}

export default function SeoSettings() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [settings, setSettings] = useState(null);
  const [savedSettings, setSavedSettings] = useState(null);
  const [editingDefaultMeta, setEditingDefaultMeta] = useState(false);
  const [pages, setPages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pageEdits, setPageEdits] = useState({});
  const [pendingLog, setPendingLog] = useState("");
  const [deletingLog, setDeletingLog] = useState(null);

  const loadLogs = useCallback(async () => {
    const result = await adminRequest(`/admin/seo/404-logs?page=${page}&limit=10${query ? `&q=${encodeURIComponent(query)}` : ""}`);
    setLogs(result.data);
    setPagination(result.meta || { page: 1, pages: 1, total: 0 });
  }, [page, query]);

  useEffect(() => {
    let active = true;
    adminRequest("/admin/site-settings")
      .then((result) => {
        if (active) {
          const seo = { ...DEFAULTS, ...result.data.seo };
          setSettings(seo);
          setSavedSettings(seo);
        }
      })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "Robots Meta Content") return;
    let active = true;
    adminRequest("/admin/pages?limit=100")
      .then((result) => {
        if (active) setPages(result.data.map((item) => ({
          ...item,
          seo: { title: "", description: "", robots: "index, follow", ...(item.seo || {}) },
        })));
      })
      .catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "404 Logs") return;
    loadLogs().catch((loadError) => setError(loadError.message));
  }, [activeTab, loadLogs]);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateRobotsOption(key, value) {
    const options = { ...parseRobotsMeta(settings.robotsMeta), [key]: value };
    update("robotsMeta", formatRobotsMeta(options));
  }

  function resetDefaultMetaForm() {
    setSettings((current) => ({ ...current, ...savedSettings }));
    setError("");
    setMessage("");
  }

  async function saveSettings(fields, successMessage = "SEO settings saved.") {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await adminRequest("/admin/site-settings/seo", {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      setSettings((current) => ({ ...current, ...result.data }));
      setSavedSettings((current) => ({ ...current, ...result.data }));
      setMessage(successMessage);
      return true;
    } catch (saveError) {
      setError(saveError.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function resetSeo() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await adminRequest("/admin/site-settings/seo/reset", { method: "POST" });
      const seo = { ...DEFAULTS, ...result.data };
      setSettings(seo);
      setSavedSettings(seo);
      setMessage("SEO settings reset to defaults.");
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadSitemap(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml") || file.size > 8 * 1024 * 1024) {
      setError("Choose an XML sitemap smaller than 8 MB.");
      return;
    }
    const body = new FormData();
    body.append("file", file);
    setSaving(true);
    setError("");
    try {
      const result = await adminRequest("/admin/seo/sitemap/upload", { method: "POST", body });
      setSettings((current) => ({ ...current, sitemapXml: result.data.sitemapXml }));
      setMessage("Sitemap uploaded and is now served by your store.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadShareImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      setError("Choose a PNG, JPG or WebP social sharing image.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const image = await uploadImage(file, "seo");
      update("shareImage", { url: image.url, publicId: image.publicId, alt: "" });
      setMessage("Image uploaded. Save your SEO information to publish it.");
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setSaving(false);
    }
  }

  async function generateSitemap(saveToServer) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (saveToServer) {
        await adminRequest("/admin/seo/sitemap/generate", { method: "POST", body: JSON.stringify({}) });
        setSettings((current) => ({ ...current, sitemapXml: "" }));
        setMessage("Sitemap generated and uploaded to your store.");
      } else {
        const response = await fetch(`${sitemapUrl}?refresh=true`);
        if (!response.ok) throw new Error(`Could not download sitemap (${response.status}).`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "sitemap.xml";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Sitemap generated and downloaded.");
      }
    } catch (generateError) {
      setError(generateError.message);
    } finally {
      setSaving(false);
    }
  }

  async function savePage(pageId) {
    const edit = pageEdits[pageId];
    if (!edit) return;
    setPendingLog(`page:${pageId}`);
    setError("");
    try {
      const result = await adminRequest(`/admin/pages/${pageId}`, {
        method: "PATCH",
        body: JSON.stringify({ seo: edit }),
      });
      setPages((current) => current.map((item) => item.id === pageId ? { ...item, seo: { ...item.seo, ...result.data.seo } } : item));
      setPageEdits((current) => { const next = { ...current }; delete next[pageId]; return next; });
      setMessage(`SEO metadata saved for ${result.data.title}.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setPendingLog("");
    }
  }

  async function saveRedirect(log) {
    const redirectTo = log.redirectTo || "";
    setPendingLog(log.id);
    setError("");
    try {
      const result = await adminRequest(`/admin/seo/404-logs/${log.id}`, {
        method: "PATCH",
        body: JSON.stringify({ redirectTo }),
      });
      setLogs((current) => current.map((item) => item.id === log.id ? { ...item, redirectTo: result.data.redirectTo } : item));
      setMessage(`Redirect saved for ${log.path}.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setPendingLog("");
    }
  }

  async function deleteLog(log) {
    setDeletingLog(log);
  }

  async function confirmDeleteLog() {
    const log = deletingLog;
    setPendingLog(log.id);
    setError("");
    try {
      await adminRequest(`/admin/seo/404-logs/${log.id}`, { method: "DELETE" });
      await loadLogs();
      setMessage("404 log deleted.");
      setDeletingLog(null);
    } catch (deleteError) {
      setError(deleteError.message);
      throw deleteError;
    } finally {
      setPendingLog("");
    }
  }

  if (loading) return <div className="seo-settings"><p className="seo-status" role="status">Loading SEO settings…</p></div>;

  const robotsText = settings?.robotsTxt || DEFAULT_ROBOTS(settings?.canonical || "https://shoponzy.in");
  const sitemapUrl = `${API_BASE}/seo/sitemap.xml`;

  return (
    <div className="seo-settings">
      <div className="seo-page-heading"><div><p className="eyebrow">STOREFRONT</p><h1>SEO Settings</h1><p className="muted">Manage indexing, metadata and search visibility for your store.</p></div></div>
      <div className="seo-tabs" role="tablist" aria-label="SEO settings sections">
        {TABS.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => { setActiveTab(tab); setError(""); setMessage(""); }}>{tab}</button>)}
      </div>
      <ErrorMessage>{error}</ErrorMessage>
      {message && <p className="seo-success" role="status">{message}</p>}

      {activeTab === "Webmaster Tools" && settings && <>
        <SeoCard title="Webmaster Tools" description={<>Verify your site with search engines to monitor indexing and search performance. <a href="https://support.google.com/webmasters/answer/9008080" target="_blank" rel="noreferrer">Learn more</a></>}>
          <div className="seo-notice">After entering your verification IDs, save your information to apply the verification tags.</div>
          <div className="seo-provider-list">
            {[
              ["Google Search Console", "googleVerification", "Paste the verification ID or complete meta tag from Google Search Console.", "https://search.google.com/search-console"],
              ["Bing Webmaster Tools", "bingVerification", "Paste your Bing site verification ID.", "https://www.bing.com/webmasters"],
              ["Baidu Webmaster Tools", "baiduVerification", "Paste your Baidu site verification ID.", "https://ziyuan.baidu.com"],
              ["Yandex Webmaster", "yandexVerification", "Paste your Yandex verification ID.", "https://webmaster.yandex.com"],
            ].map(([label, key, hint, url]) => <div className="seo-provider" key={key}>
              <div><span className="seo-provider-mark">{label[0]}</span><h3>{label}</h3><p>Connect your site to {label}.</p><a href={url} target="_blank" rel="noreferrer">Open service ↗</a></div>
              <SeoField label={`${label} verification`} hint={hint}><input value={settings[key]} onChange={(event) => update(key, event.target.value)} placeholder="Enter your HTML code or ID" /></SeoField>
            </div>)}
          </div>
          <div className="seo-actions"><button type="button" className="seo-button secondary" onClick={resetSeo} disabled={saving}>Reset</button><button type="button" className="seo-button primary" onClick={() => saveSettings(Object.fromEntries(["googleVerification", "bingVerification", "baiduVerification", "yandexVerification"].map((key) => [key, settings[key]])))} disabled={saving}>{saving ? "Saving…" : "Save information"}</button></div>
        </SeoCard>
      </>}

      {activeTab === "Robots.txt" && settings && <SeoCard title="Robots.txt Editor" description="Control which parts of your website search engine crawlers can access." action={<a className="seo-button primary" href={`${API_BASE}/seo/robots.txt`} target="_blank" rel="noreferrer">View URL ↗</a>}>
        <div className="seo-notice">The robots.txt file is served automatically. Edit the directives below, then save to publish your changes.</div>
        <SeoField label="Robots.txt content" hint="Keep the Sitemap directive so crawlers can discover your sitemap.">
          <textarea className="seo-code-editor" rows="12" value={settings.robotsTxt || robotsText} onChange={(event) => update("robotsTxt", event.target.value)} spellCheck="false" />
        </SeoField>
        <div className="seo-actions"><button type="button" className="seo-button secondary" onClick={() => saveSettings({ robotsTxt: "" }, "Robots.txt reset to the generated default.")} disabled={saving}>Reset</button><button type="button" className="seo-button primary" onClick={() => saveSettings({ robotsTxt: settings.robotsTxt || robotsText })} disabled={saving}>{saving ? "Saving…" : "Save information"}</button></div>
      </SeoCard>}

      {activeTab === "Sitemap" && settings && <>
        <SeoCard title="Sitemap" description="Generate and manage the XML sitemap used by search engines.">
          <div className="seo-notice">Your sitemap includes published pages, active categories and products. The generated sitemap is available at <a href={sitemapUrl} target="_blank" rel="noreferrer">{sitemapUrl}</a>.</div>
          <div className="seo-sitemap-actions"><h3>Generate Sitemap</h3><div><button type="button" className="seo-button primary" onClick={() => generateSitemap(false)} disabled={saving}>Generate &amp; Download</button><button type="button" className="seo-button outline" onClick={() => generateSitemap(true)} disabled={saving}>Generate &amp; Upload to Server</button><label className="seo-button outline">Upload Sitemap<input type="file" accept=".xml,text/xml,application/xml" onChange={uploadSitemap} /></label></div></div>
          {settings.sitemapXml && <p className="seo-upload-state">A custom or generated sitemap is currently being served. <button type="button" onClick={() => saveSettings({ sitemapXml: "" }, "Custom sitemap removed; the sitemap is now generated dynamically.")}>Switch to dynamic sitemap</button></p>}
        </SeoCard>
        <SeoCard title="Live sitemap" description="The live URL always serves the latest sitemap generated or uploaded above.">
          <div className="seo-sitemap-row"><span>1</span><strong>sitemap.xml</strong><a href={sitemapUrl} target="_blank" rel="noreferrer">{sitemapUrl}</a><span>Live</span><a className="seo-icon-button" href={sitemapUrl} target="_blank" rel="noreferrer" aria-label="Open sitemap">↗</a></div>
        </SeoCard>
      </>}

      {activeTab === "Robots Meta Content" && settings && <>
        <SeoCard title="Update Default Meta" description="Use this metadata on pages that do not have page-specific SEO content.">
          {!editingDefaultMeta ? <div className="seo-default-meta-preview">
            <h3>Default meta content</h3>
            <p>If you do not have any meta content on a page, it will automatically use the meta content from this section.</p>
            <button type="button" className="seo-button seo-edit-content" onClick={() => { setEditingDefaultMeta(true); setError(""); setMessage(""); }}>＋ Edit Content</button>
          </div> : <div className="seo-default-meta seo-default-meta-editor">
            <div className="seo-meta-fields">
              <SeoField label="Meta Title"><input maxLength="70" value={settings.title} onChange={(event) => update("title", event.target.value)} /></SeoField>
              <SeoField label="Meta description"><textarea rows="4" maxLength="160" value={settings.description} onChange={(event) => update("description", event.target.value)} /></SeoField>
              <div className="seo-share-image">
                <SeoField label="Meta image" hint="Recommended: 1200 x 630 px (wide social preview). Maximum 5 MB."><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadShareImage} /></SeoField>
                {settings.shareImage?.url && <div><img src={settings.shareImage.url} alt="Meta image preview" /><button type="button" onClick={() => update("shareImage", null)}>Remove image</button></div>}
              </div>
            </div>
            <div className="seo-canonical-panel"><strong>Canonical URL</strong><SeoField label="Canonical URL"><input type="url" value={settings.canonical} onChange={(event) => update("canonical", event.target.value)} /></SeoField></div>
            <div className="seo-robots-editor">
              {(() => {
                const robots = parseRobotsMeta(settings.robotsMeta);
                return <>
                  <fieldset className="seo-robots-options">
                    <legend>Robots directives</legend>
                    <label><input type="radio" name="robots-index" checked={robots.index} onChange={() => updateRobotsOption("index", true)} /> Index</label>
                    <label><input type="radio" name="robots-index" checked={!robots.index} onChange={() => updateRobotsOption("index", false)} /> No index</label>
                    <label><input type="checkbox" checked={robots.noFollow} onChange={(event) => updateRobotsOption("noFollow", event.target.checked)} /> No Follow</label>
                    <label><input type="checkbox" checked={robots.noArchive} onChange={(event) => updateRobotsOption("noArchive", event.target.checked)} /> No Archive</label>
                    <label><input type="checkbox" checked={robots.noImageIndex} onChange={(event) => updateRobotsOption("noImageIndex", event.target.checked)} /> No Image Index</label>
                    <label><input type="checkbox" checked={robots.noSnippet} onChange={(event) => updateRobotsOption("noSnippet", event.target.checked)} /> No Snippet</label>
                  </fieldset>
                  <fieldset className="seo-robots-options seo-robots-preview">
                    <legend>Search preview limits</legend>
                    <label><input type="checkbox" checked={robots.maxSnippetEnabled} onChange={(event) => updateRobotsOption("maxSnippetEnabled", event.target.checked)} /> Max Snippet</label>
                    <input type="number" min="-1" aria-label="Maximum snippet length" value={robots.maxSnippet} onChange={(event) => updateRobotsOption("maxSnippet", event.target.value)} />
                    <label><input type="checkbox" checked={robots.maxVideoPreviewEnabled} onChange={(event) => updateRobotsOption("maxVideoPreviewEnabled", event.target.checked)} /> Max Video Preview</label>
                    <input type="number" min="-1" aria-label="Maximum video preview seconds" value={robots.maxVideoPreview} onChange={(event) => updateRobotsOption("maxVideoPreview", event.target.value)} />
                    <label><input type="checkbox" checked={robots.maxImagePreviewEnabled} onChange={(event) => updateRobotsOption("maxImagePreviewEnabled", event.target.checked)} /> Max Image Preview</label>
                    <select aria-label="Maximum image preview size" value={robots.maxImagePreview} onChange={(event) => updateRobotsOption("maxImagePreview", event.target.value)}>
                      <option value="large">Large</option><option value="standard">Standard</option><option value="none">None</option>
                    </select>
                  </fieldset>
                </>;
              })()}
            </div>
            <details className="seo-advanced-meta">
              <summary>Additional social metadata</summary>
              <div className="seo-advanced-meta-fields">
                <SeoField label="Search keywords" hint="Separate keywords with commas."><input maxLength="300" value={settings.keywords} onChange={(event) => update("keywords", event.target.value)} /></SeoField>
                <SeoField label="Open Graph title"><input maxLength="90" value={settings.ogTitle} onChange={(event) => update("ogTitle", event.target.value)} /></SeoField>
                <SeoField label="Open Graph description"><textarea rows="3" maxLength="200" value={settings.ogDescription} onChange={(event) => update("ogDescription", event.target.value)} /></SeoField>
              </div>
            </details>
            <div className="seo-actions">
              <button type="button" className="seo-button secondary" onClick={resetDefaultMetaForm} disabled={saving}>Reset</button>
              <button type="button" className="seo-button secondary" onClick={() => { resetDefaultMetaForm(); setEditingDefaultMeta(false); }}>Cancel</button>
              <button type="button" className="seo-button primary" onClick={async () => {
                const saved = await saveSettings({ title: settings.title, description: settings.description, keywords: settings.keywords, canonical: settings.canonical, ogTitle: settings.ogTitle, ogDescription: settings.ogDescription, shareImage: settings.shareImage, robotsMeta: settings.robotsMeta });
                if (saved) setEditingDefaultMeta(false);
              }} disabled={saving}>{saving ? "Saving…" : "Submit"}</button>
            </div>
          </div>}
        </SeoCard>
        <SeoCard title="Page SEO metadata" description="Customize title, description and indexing rules for individual pages.">
          <div className="seo-table-wrap"><table className="seo-table"><thead><tr><th>Page</th><th>URL</th><th>SEO title</th><th>Meta description</th><th>Robots</th><th>Action</th></tr></thead><tbody>
            {pages.map((item) => {
              const edit = pageEdits[item.id] || item.seo;
              return <tr key={item.id}><td>{item.title}</td><td><a href={`${window.location.origin}/pages/${item.slug}`} target="_blank" rel="noreferrer">/pages/{item.slug}</a></td>
                <td><input maxLength="70" value={edit.title} onChange={(event) => setPageEdits((current) => ({ ...current, [item.id]: { ...edit, title: event.target.value } }))} aria-label={`${item.title} SEO title`} /></td>
                <td><textarea rows="2" maxLength="160" value={edit.description} onChange={(event) => setPageEdits((current) => ({ ...current, [item.id]: { ...edit, description: event.target.value } }))} aria-label={`${item.title} meta description`} /></td>
                <td><select value={edit.robots} onChange={(event) => setPageEdits((current) => ({ ...current, [item.id]: { ...edit, robots: event.target.value } }))} aria-label={`${item.title} robots directive`}>{ROBOTS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></td>
                <td><button type="button" className="seo-button outline" onClick={() => savePage(item.id)} disabled={pendingLog === `page:${item.id}`}>{pendingLog === `page:${item.id}` ? "Saving…" : "Save"}</button></td></tr>;
            })}
            {!pages.length && <tr><td colSpan="6">No pages found.</td></tr>}
          </tbody></table></div>
        </SeoCard>
      </>}

      {activeTab === "404 Logs" && <SeoCard title="404 Logs" description="Track storefront pages that visitors could not find and add redirects.">
        <form className="seo-log-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }}>
          <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search missing URLs…" aria-label="Search 404 URLs" />
          <button type="submit" className="seo-button outline">Search</button>
        </form>
        <div className="seo-table-wrap"><table className="seo-table"><thead><tr><th><input type="checkbox" aria-label="Select all URLs" disabled /></th><th>URL</th><th>Hits</th><th>Last hit</th><th>Redirection link</th><th>Action</th></tr></thead><tbody>
          {logs.map((log) => <tr key={log.id}><td><input type="checkbox" aria-label={`Select ${log.path}`} disabled /></td><td><a href={`${settings?.canonical || window.location.origin}${log.path}`} target="_blank" rel="noreferrer">{log.path}</a></td><td>{log.hits}</td><td>{new Date(log.lastHitAt).toLocaleString()}</td>
            <td><div className="seo-redirect"><input value={log.redirectTo || ""} placeholder="https:// or /path" aria-label={`Redirect for ${log.path}`} onChange={(event) => setLogs((current) => current.map((item) => item.id === log.id ? { ...item, redirectTo: event.target.value } : item))} /><button type="button" className="seo-button outline" onClick={() => saveRedirect(log)} disabled={pendingLog === log.id}>{pendingLog === log.id ? "Saving…" : log.redirectTo ? "Save link" : "Add link"}</button></div></td>
            <td><button type="button" className="seo-icon-button danger" aria-label={`Delete ${log.path}`} onClick={() => deleteLog(log)} disabled={pendingLog === log.id}>×</button></td></tr>)}
          {!logs.length && <tr><td colSpan="6">No 404 visits have been recorded.</td></tr>}
        </tbody></table></div>
        <div className="seo-pagination"><span>{pagination.total} logged URLs</span><div><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>Previous</button><span>Page {page} of {Math.max(1, pagination.pages)}</span><button type="button" onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))} disabled={page >= pagination.pages}>Next</button></div></div>
      </SeoCard>}
      {deletingLog && <DeleteConfirmDialog title="Delete 404 log?" message={`The log for “${deletingLog.path}” will be permanently deleted.`} onCancel={() => setDeletingLog(null)} onConfirm={confirmDeleteLog} />}
    </div>
  );
}
