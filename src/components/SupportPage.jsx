import { useEffect, useState } from "react";
import { adminRequest } from "../api/adminApi";
import { dateTime } from "../utils/format";
import {
  Badge, ErrorBanner, ExportButton, Field, KeyValues, Modal, PageHeading, Pagination, StatCards, TableBody,
  dayEnd, dayStart, qs, useAdminData, useToast,
} from "./ops/OpsKit";

/* eslint-disable react/prop-types */
const PAGE_SIZE = 20;
// Stored "read" is shown as "Open" (kept for existing data).
const STATUS = { new: ["New", "requested"], read: ["Open", "pickup_scheduled"], replied: ["Replied", "approved"], closed: ["Closed", "inactive"] };
const TOPICS = ["Order question", "Return / exchange", "Product question", "Something else"];
const StatusBadge = ({ status }) => <Badge value={STATUS[status]?.[1] || "inactive"} label={STATUS[status]?.[0] || status} />;
const waLink = (phone) => `https://wa.me/91${String(phone).replace(/\D/g, "").slice(-10)}`;

function SupportDetail({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data: m, error, loading, reload } = useAdminData(`/admin/contact-messages/${id}`, { debounce: 0 });
  const [reply, setReply] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [close, setClose] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => { if (m) { setSendEmail(Boolean(m.email)); onChanged(); } }, [m?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(kind, fn, message) {
    setBusy(kind);
    try { await fn(); toast(message); await reload(); onChanged(); return true; } catch (e) { toast(e.message, "error"); return false; } finally { setBusy(""); }
  }
  const sendReply = () => act("reply", () => adminRequest(`/admin/contact-messages/${id}/reply`, { method: "POST", body: JSON.stringify({ message: reply.trim(), sendEmail, close }) }),
    sendEmail ? `Reply emailed to ${m.email}.` : "Reply saved (not emailed).").then((ok) => ok && setReply(""));
  const addNote = () => act("note", () => adminRequest(`/admin/contact-messages/${id}/notes`, { method: "POST", body: JSON.stringify({ note: note.trim() }) }), "Note added.").then((ok) => ok && setNote(""));
  const setStatus = (status) => act("status", () => adminRequest(`/admin/contact-messages/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }), `Marked ${STATUS[status][0].toLowerCase()}.`);

  const thread = m ? [...(m.replies || []).map((r) => ({ ...r, kind: "reply" })), ...(m.notes || []).map((n) => ({ ...n, kind: "note" }))].sort((a, b) => new Date(a.at) - new Date(b.at)) : [];
  return (
    <Modal wide title={m ? `${m.name} — ${m.topic || "Message"}` : "Support request"} eyebrow="HELP & SUPPORT" onClose={onClose} busy={Boolean(busy)}
      footer={m && <>
        <select className="ops-inline-select" value={m.status} disabled={Boolean(busy)} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" className="secondary-button" onClick={onClose}>Close</button>
      </>}>
      <ErrorBanner error={error} onRetry={reload} />
      {!m && loading && <p className="muted">Loading…</p>}
      {m && <>
        <KeyValues rows={[
          ["Status", <StatusBadge key="s" status={m.status} />],
          ["Received", dateTime(m.createdAt)],
          ["Customer", <span key="c">{m.name}{m.user ? <small> · has an account</small> : null}</span>],
          ["Phone", <span key="p"><a href={`tel:${m.phone}`}>{m.phone}</a> · <a href={waLink(m.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a></span>],
          ["Email", m.email ? <a key="e" href={`mailto:${m.email}`}>{m.email}</a> : "Not given"],
          ["Order", m.orderNumber ? `#${m.orderNumber}` : "—"],
        ]} />
        <h3 className="ops-section-title">Message</h3>
        <div className="ops-note" style={{ whiteSpace: "pre-wrap" }}>{m.message}</div>
        {!!thread.length && <>
          <h3 className="ops-section-title">Conversation &amp; notes</h3>
          <ul className="ops-thread">
            {thread.map((t, i) => (
              <li key={i} className={t.kind}>
                <div className="ops-thread-head"><b>{t.kind === "reply" ? (t.emailed ? "Reply (emailed)" : "Reply (not emailed)") : "Internal note"}</b><span>{t.by?.name || "Admin"} · {dateTime(t.at)}</span></div>
                <div style={{ whiteSpace: "pre-wrap" }}>{t.kind === "reply" ? t.message : t.note}</div>
              </li>
            ))}
          </ul>
        </>}
        <h3 className="ops-section-title">Reply</h3>
        <textarea className="ops-textarea" rows={4} value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} placeholder={m.email ? `Write your reply to ${m.name}…` : "No email address — call or WhatsApp the customer, then record what you told them here."} />
        <div className="ops-reply-bar">
          <label><input type="checkbox" checked={sendEmail} disabled={!m.email} onChange={(e) => setSendEmail(e.target.checked)} /> Email this reply{m.email ? ` to ${m.email}` : " (no email given)"}</label>
          <label><input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} /> Close after replying</label>
          <button type="button" className="primary-button" disabled={reply.trim().length < 2 || Boolean(busy)} onClick={sendReply}>{busy === "reply" ? "Sending…" : sendEmail ? "Send reply" : "Save reply"}</button>
        </div>
        <h3 className="ops-section-title">Internal note <small className="muted">(never shown to the customer)</small></h3>
        <div className="ops-reply-bar">
          <input className="ops-inline-input" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called back, waiting for courier update" />
          <button type="button" className="secondary-button" disabled={note.trim().length < 2 || Boolean(busy)} onClick={addNote}>Add note</button>
        </div>
      </>}
    </Modal>
  );
}

function SupportRequests() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [topic, setTopic] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const filters = { q: q.trim(), status, topic, from: dayStart(from), to: dayEnd(to) };
  const { data, meta, loading, error, reload } = useAdminData(`/admin/contact-messages?${qs({ ...filters, page, limit: PAGE_SIZE })}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const c = meta?.counts || {};
  const reset = (fn) => (e) => { fn(e.target.value); setPage(1); };
  return (
    <>
      <StatCards loading={!meta && loading} items={[
        { label: "New", value: String(c.new || 0), tone: "amber", note: "not opened yet" },
        { label: "Open", value: String(c.read || 0), note: "being handled" },
        { label: "Replied", value: String(c.replied || 0), tone: "green" },
        { label: "Closed", value: String(c.closed || 0), tone: "slate" },
      ]} />
      <section className="panel table-panel">
        <div className="ops-toolbar">
          <div><h2>Support requests</h2><p className="muted">Messages from the storefront contact form. Open one to reply, add notes or close it.</p></div>
          <div className="ops-filters">
            <input type="search" value={q} onChange={reset(setQ)} placeholder="Search name, phone, email, order or message…" aria-label="Search support requests" />
            <select value={status} onChange={reset(setStatus)} aria-label="Filter by status"><option value="">All statuses</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            <select value={topic} onChange={reset(setTopic)} aria-label="Filter by topic"><option value="">All topics</option>{TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <div className="ops-daterange" role="group" aria-label="Date range"><span>From</span><input type="date" aria-label="From date" value={from} max={to || undefined} onChange={reset(setFrom)} /><span>To</span><input type="date" aria-label="To date" value={to} min={from || undefined} onChange={reset(setTo)} /></div>
            <ExportButton path={`/admin/contact-messages/export.csv?${qs(filters)}`} filename="shoponzy-support-requests" disabled={!meta?.total} />
          </div>
        </div>
        <ErrorBanner error={error} onRetry={reload} />
        <div className="table-scroll">
          <table className="ops-table">
            <thead><tr><th>Received</th><th>Customer</th><th>Topic</th><th>Message</th><th>Status</th><th className="num">Replies</th><th>Actions</th></tr></thead>
            <TableBody loading={loading} items={rows} columns={7} empty="No support requests" emptyHint={q || status || topic || from || to ? "Try clearing the search or filters." : "Messages sent from the storefront’s Contact us form appear here."}>
              {rows.map((m) => (
                <tr key={m.id} className={m.status === "new" ? "ops-row-new" : ""}>
                  <td className="ops-nowrap">{dateTime(m.createdAt)}</td>
                  <td><strong>{m.name}</strong><small>{[m.phone, m.email].filter(Boolean).join(" · ")}</small></td>
                  <td>{m.topic || "—"}{m.orderNumber && <small>Order #{m.orderNumber}</small>}</td>
                  <td style={{ maxWidth: 360 }}><span className="ops-clamp">{m.message}</span></td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="num">{m.replies?.length || 0}</td>
                  <td><button type="button" className="table-action" onClick={() => setOpenId(m.id)}>{m.status === "new" ? "Open" : "View"}</button></td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
        <Pagination meta={meta} page={page} onPage={setPage} />
      </section>
      {openId && <SupportDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}

/* Support contact details (the same "contact" settings as Manage Site) + auto-reply switch. */
function SupportSettings() {
  const toast = useToast();
  const all = useAdminData("/admin/site-settings", { debounce: 0 });
  const notif = useAdminData("/admin/notifications/settings", { debounce: 0 });
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (all.data && !v) setV(all.data.contact); }, [all.data, v]);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    setBusy(true);
    try {
      await adminRequest("/admin/site-settings/contact", { method: "PATCH", body: JSON.stringify({ email: v.email.trim(), phone: v.phone.trim(), whatsapp: String(v.whatsapp || "").replace(/\D/g, ""), hours: v.hours.trim(), address: v.address.trim() }) });
      toast("Support contact details saved. The storefront shows them on the Help page and footer.");
      await all.reload();
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  }
  async function flipAutoReply(value) {
    try { await adminRequest("/admin/notifications/settings", { method: "PUT", body: JSON.stringify({ supportAutoReply: value }) }); toast(`Auto-reply ${value ? "on" : "off"}.`); await notif.reload(); } catch (e) { toast(e.message, "error"); }
  }
  return (
    <div className="ops-stack">
      <section className="panel">
        <div className="ops-toolbar"><div><h2>Support contact details</h2><p className="muted">Shown to customers on the storefront Help page and footer. Same details as Manage Site → Contact &amp; Social Links.</p></div></div>
        <ErrorBanner error={all.error} onRetry={all.reload} />
        {v && <div className="ops-form">
          <Field label="Support email"><input type="email" value={v.email || ""} onChange={set("email")} /></Field>
          <Field label="Support phone"><input value={v.phone || ""} onChange={set("phone")} /></Field>
          <Field label="WhatsApp number" hint="Digits with country code, e.g. 919876543210"><input value={v.whatsapp || ""} inputMode="numeric" onChange={set("whatsapp")} /></Field>
          <Field label="Support hours"><input value={v.hours || ""} maxLength={120} onChange={set("hours")} /></Field>
          <Field label="Address" full><textarea rows={2} value={v.address || ""} maxLength={300} onChange={set("address")} /></Field>
        </div>}
        <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="primary-button" disabled={!v || busy} onClick={save}>{busy ? "Saving…" : "Save contact details"}</button>
        </div>
      </section>
      <section className="panel">
        <div className="ops-toolbar"><div><h2>Automatic reply</h2><p className="muted">Emails customers who leave an email address to confirm their message arrived (includes your support hours).</p></div></div>
        <ErrorBanner error={notif.error} onRetry={notif.reload} />
        <div className="ops-switches">
          <label className="ops-switch-row">
            <span><strong>Send an auto-reply to new messages</strong><small>{notif.data && !notif.data.emailConfigured ? "Email isn’t set up on the server yet, so auto-replies aren’t sent." : "Sent within seconds of the message."}</small></span>
            <input type="checkbox" role="switch" checked={Boolean(notif.data?.settings?.supportAutoReply)} disabled={!notif.data} onChange={(e) => flipAutoReply(e.target.checked)} aria-label="Support auto-reply" />
          </label>
        </div>
      </section>
    </div>
  );
}

export default function SupportPage({ view = "requests" }) {
  const copy = view === "settings"
    ? ["Support Settings", "How customers reach you, and the automatic reply they get."]
    : ["Support Requests", "Answer customer questions sent from the storefront’s Contact us form."];
  return (
    <>
      <PageHeading eyebrow="HELP & SUPPORT" title={copy[0]} description={copy[1]} />
      {view === "settings" ? <SupportSettings /> : <SupportRequests />}
    </>
  );
}
