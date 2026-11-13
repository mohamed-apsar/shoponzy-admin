import { useEffect, useState } from "react";
import { adminRequest } from "../api/adminApi";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { dateTime } from "../utils/format";
import {
  Badge, ErrorBanner, ExportButton, Field, Modal, MoreMenu, PageHeading, Pagination, StatCards, TableBody,
  qs, useAdminData, useToast,
} from "./ops/OpsKit";

/* eslint-disable react/prop-types */
function FaqEditor({ faq, categories, onClose, onSaved }) {
  const toast = useToast();
  const [values, setValues] = useState({ question: faq?.question || "", answer: faq?.answer || "", category: faq?.category || "General", status: faq?.status || "active" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const valid = values.question.trim().length >= 5 && values.answer.trim().length >= 2 && values.category.trim().length >= 2;
  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = JSON.stringify({ ...values, question: values.question.trim(), answer: values.answer.trim(), category: values.category.trim() });
      if (faq) await adminRequest(`/admin/faqs/${faq.id}`, { method: "PATCH", body });
      else await adminRequest("/admin/faqs", { method: "POST", body });
      toast(faq ? "FAQ updated." : "FAQ added. It appears on the storefront Help page.");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title={faq ? "Edit FAQ" : "Add FAQ"} eyebrow="FAQ MANAGEMENT" onClose={onClose} busy={busy} footer={<>
      <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className="primary-button" disabled={!valid || busy} onClick={save}>{busy ? "Saving…" : faq ? "Save changes" : "Add FAQ"}</button>
    </>}>
      <div className="ops-form">
        <Field label="Question" full><input value={values.question} maxLength={300} onChange={set("question")} placeholder="e.g. How long does delivery take?" autoFocus /></Field>
        <Field label="Answer" full hint={`${values.answer.length}/5000 · plain text; blank lines start a new paragraph`}><textarea rows={6} value={values.answer} maxLength={5000} onChange={set("answer")} /></Field>
        <Field label="Category" hint="Groups FAQs on the Help page">
          <input list="faq-categories" value={values.category} maxLength={60} onChange={set("category")} />
          <datalist id="faq-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Visibility">
          <select value={values.status} onChange={set("status")}><option value="active">Shown on storefront</option><option value="hidden">Hidden</option></select>
        </Field>
      </div>
      {error && <div className="products-form-error" role="alert">{error}</div>}
    </Modal>
  );
}

export default function FaqPage() {
  const PAGE_SIZE = 20;
  const toast = useToast();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null); // {} = new, faq = edit
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data, meta, loading, error, reload } = useAdminData(`/admin/faqs?${qs({ q: q.trim(), category, status })}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const firstIndex = (page - 1) * PAGE_SIZE;
  const visibleRows = rows.slice(firstIndex, firstIndex + PAGE_SIZE);
  const filtered = Boolean(q.trim() || category || status);
  const counts = meta?.counts || {};
  useEffect(() => { setPage(1); }, [q, category, status]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  async function run(fn, message) {
    setBusy(true);
    try { await fn(); if (message) toast(message); await reload(); } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }
  const move = (index, dir) => {
    const ids = rows.map((r) => r.id);
    [ids[index], ids[index + dir]] = [ids[index + dir], ids[index]];
    return run(() => adminRequest("/admin/faqs/order", { method: "PUT", body: JSON.stringify({ ids }) }));
  };
  const toggle = (faq) => run(() => adminRequest(`/admin/faqs/${faq.id}`, { method: "PATCH", body: JSON.stringify({ status: faq.status === "active" ? "hidden" : "active" }) }),
    faq.status === "active" ? "FAQ hidden from the storefront." : "FAQ shown on the storefront.");

  return (
    <>
      <PageHeading eyebrow="CONTENT" title="FAQ Management" description="Questions and answers shown on the storefront Help page. Customers see shown FAQs in this order."
        actions={<button type="button" className="primary-button" onClick={() => setEditing({})}>＋ Add FAQ</button>} />
      <StatCards loading={!meta && loading} items={[
        { label: "Total FAQs", value: String((counts.active || 0) + (counts.hidden || 0)) },
        { label: "Shown on storefront", value: String(counts.active || 0), tone: "green" },
        { label: "Hidden", value: String(counts.hidden || 0), tone: "slate" },
        { label: "Categories", value: String(meta?.categories?.length || 0), tone: "amber" },
      ]} />
      <section className="panel table-panel">
        <div className="ops-toolbar">
          <div><h2>All FAQs</h2><p className="muted">{filtered ? "Clear the filters to change the order." : "Use ↑ ↓ to change the order on the Help page."}</p></div>
          <div className="ops-filters">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions and answers…" aria-label="Search FAQs" />
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>{(meta?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by visibility">
              <option value="">Shown and hidden</option><option value="active">Shown</option><option value="hidden">Hidden</option>
            </select>
            <ExportButton path="/admin/faqs/export.csv" filename="shoponzy-faqs" disabled={!rows.length && !filtered} />
          </div>
        </div>
        <ErrorBanner error={error} onRetry={reload} />
        <div className="table-scroll">
          <table className="ops-table">
            <thead><tr><th>Order</th><th>Question &amp; answer</th><th>Category</th><th>Visibility</th><th>Updated</th><th>Actions</th></tr></thead>
            <TableBody loading={loading} items={rows} columns={6} empty={filtered ? "No FAQs match" : "No FAQs yet"}
              emptyHint={filtered ? "Try clearing the search or filters." : "Add your first FAQ, or start from the three FAQs the storefront shows today."}>
              {visibleRows.map((f, i) => {
                const index = firstIndex + i;
                return <tr key={f.id}>
                  <td className="ops-nowrap"><div className="ops-actions">
                    <button type="button" className="table-action" aria-label="Move up" disabled={filtered || busy || index === 0} onClick={() => move(index, -1)}>↑</button>
                    <button type="button" className="table-action" aria-label="Move down" disabled={filtered || busy || index === rows.length - 1} onClick={() => move(index, 1)}>↓</button>
                  </div></td>
                  <td style={{ maxWidth: 560 }}><strong>{f.question}</strong><small className="ops-clamp">{f.answer}</small></td>
                  <td>{f.category}</td>
                  <td><Badge value={f.status === "active" ? "in" : "inactive"} label={f.status === "active" ? "Shown" : "Hidden"} /></td>
                  <td className="ops-nowrap">{dateTime(f.updatedAt)}</td>
                  <td><div className="ops-actions">
                    <button type="button" className="table-action" onClick={() => setEditing(f)}>Edit</button>
                    <MoreMenu label={`More actions for ${f.question}`} items={[
                      { label: f.status === "active" ? "Hide from storefront" : "Show on storefront", onClick: () => toggle(f) },
                      { label: "Delete", onClick: () => setDeleting(f) },
                    ]} />
                  </div></td>
                </tr>;
              })}
            </TableBody>
          </table>
        </div>
        <Pagination meta={{ total: rows.length, pages: pageCount }} page={page} onPage={setPage} />
        {!loading && !rows.length && !filtered && (
          <div className="ops-empty-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={() => run(() => adminRequest("/admin/faqs/import-defaults", { method: "POST" }), "Imported the storefront’s current FAQs.")}>Start from the current storefront FAQs</button>
            <button type="button" className="primary-button" onClick={() => setEditing({})}>＋ Add FAQ</button>
          </div>
        )}
      </section>
      {editing && <FaqEditor faq={editing.id ? editing : null} categories={meta?.categories || []} onClose={() => setEditing(null)} onSaved={reload} />}
      {deleting && <DeleteConfirmDialog title="Delete this FAQ?" confirmLabel="Yes, Delete" onCancel={() => setDeleting(null)}
        message={`“${deleting.question}” will be removed from the storefront Help page. You can hide it instead if you want to keep it.`}
        onConfirm={async () => { await adminRequest(`/admin/faqs/${deleting.id}`, { method: "DELETE" }); toast("FAQ deleted."); await reload(); }} />}
    </>
  );
}
