import { useEffect, useRef, useState } from "react";
import { adminRequest } from "../api/adminApi";
import { useAdminAuth } from "../context/AdminAuthContext";
import { dateTime, money, titleCase } from "../utils/format";
import {
  Badge, ConfirmDialog, ErrorBanner, ExportButton, Field, Modal, MoreMenu, PageHeading, Pagination, StatCards, TableBody, Thumb,
  dayEnd, dayStart, qs, useAdminData, useToast,
} from "./ops/OpsKit";

/* eslint-disable react/prop-types */
const TYPES = {
  new_arrival: { label: "New arrival announcement", short: "New arrivals", create: "New announcement", cta: "/products", ctaLabel: "See what's new", hint: "Pick the new products to feature (up to 12). Their photos and prices are added to the email." },
  offer: { label: "Offer / discount notification", short: "Offers & discounts", create: "New offer email", cta: "/products", ctaLabel: "Shop the offer", hint: "Add the offer and, if there is one, the coupon code customers should use." },
  sale: { label: "Sale / promotion announcement", short: "Sales & promotions", create: "New sale email", cta: "/products", ctaLabel: "Shop the sale", hint: "Add the sale period so customers know when it runs." },
};
const PAGE_SIZE = 20;
const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

/* ---------- Product picker (new arrivals) ---------- */
function ProductPicker({ selected, onChange }) {
  const [q, setQ] = useState("");
  const { data, loading } = useAdminData(`/admin/products?${qs({ q: q.trim(), sort: "newest", limit: 12, status: "active" })}`, { debounce: q ? 300 : 0 });
  const picked = new Map(selected.map((p) => [p.id, p]));
  const toggle = (p) => onChange(picked.has(p.id) ? selected.filter((x) => x.id !== p.id) : selected.length >= 12 ? selected : [...selected, { id: p.id, name: p.name, image: p.images?.[0]?.url || p.colors?.find((c) => c.featuredImage)?.featuredImage?.url, price: p.minPrice }]);
  return (
    <div className="ops-picker">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products (newest first)…" aria-label="Search products" />
      <div className="ops-picker-list">
        {loading && !data && <p className="muted">Loading products…</p>}
        {(data || []).map((p) => (
          <label key={p.id} className={picked.has(p.id) ? "on" : ""}>
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p)} disabled={!picked.has(p.id) && selected.length >= 12} />
            <Thumb src={p.images?.[0]?.url || p.colors?.find((c) => c.featuredImage)?.featuredImage?.url} />
            <span><strong>{p.name}</strong><small>{money(p.minPrice)}</small></span>
          </label>
        ))}
        {data && !data.length && <p className="muted">No products match.</p>}
      </div>
      <p className="ops-hint">{selected.length}/12 selected{selected.length ? `: ${selected.map((p) => p.name).join(", ")}` : ""}</p>
    </div>
  );
}

/* ---------- Editor ---------- */
function CampaignEditor({ type, campaign, onClose, onSaved }) {
  const toast = useToast();
  const t = TYPES[type];
  const [v, setV] = useState(() => ({
    title: campaign?.title || "", subject: campaign?.subject || "", headline: campaign?.headline || "", message: campaign?.message || "",
    offerText: campaign?.offerText || "", couponCode: campaign?.couponCode || "",
    startsAt: toLocalInput(campaign?.startsAt), endsAt: toLocalInput(campaign?.endsAt),
    ctaLabel: campaign?.ctaLabel || t.ctaLabel, ctaUrl: campaign?.ctaUrl ?? t.cta,
    products: (campaign?.products || []).map((p) => ({ id: p.id, name: p.name, image: p.images?.[0]?.url, price: p.minPrice })),
  }));
  const coupons = useAdminData(type === "offer" ? "/admin/coupons?limit=100&status=active" : null, { debounce: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const valid = v.title.trim().length >= 2 && v.subject.trim().length >= 3 && v.message.trim().length >= 5 && (type !== "new_arrival" || v.products.length > 0);

  async function save() {
    setBusy(true);
    setError("");
    const body = {
      title: v.title.trim(), subject: v.subject.trim(), headline: v.headline.trim(), message: v.message.trim(),
      ctaLabel: v.ctaLabel.trim() || t.ctaLabel, ctaUrl: v.ctaUrl.trim(),
      ...(type === "new_arrival" ? { products: v.products.map((p) => p.id) } : {}),
      ...(type !== "new_arrival" ? { offerText: v.offerText.trim() } : {}),
      ...(type === "offer" ? { couponCode: v.couponCode } : {}),
      ...(type === "sale" ? { startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null, endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null } : {}),
    };
    try {
      if (campaign) await adminRequest(`/admin/notifications/${campaign.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await adminRequest("/admin/notifications", { method: "POST", body: JSON.stringify({ type, ...body }) });
      toast(campaign ? "Draft updated." : "Draft saved. Preview it or send yourself a test before sending.");
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <Modal wide title={campaign ? `Edit: ${campaign.title}` : t.label} eyebrow="NOTIFICATIONS" onClose={onClose} busy={busy} footer={<>
      <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className="primary-button" disabled={!valid || busy} onClick={save}>{busy ? "Saving…" : "Save draft"}</button>
    </>}>
      <p className="ops-confirm-text">{t.hint} It is emailed to newsletter subscribers only — people who opted in — with an unsubscribe link.</p>
      <div className="ops-form">
        <Field label="Name (internal)"><input value={v.title} maxLength={120} onChange={set("title")} placeholder="e.g. November new drops" autoFocus /></Field>
        <Field label="Email subject"><input value={v.subject} maxLength={150} onChange={set("subject")} placeholder="e.g. Just landed: new sneakers" /></Field>
        <Field label="Headline (optional)" full><input value={v.headline} maxLength={150} onChange={set("headline")} placeholder="Big title at the top of the email" /></Field>
        <Field label="Message" full hint="Plain text. Leave a blank line to start a new paragraph."><textarea rows={5} value={v.message} maxLength={5000} onChange={set("message")} /></Field>
        {type !== "new_arrival" && <Field label="Offer text (optional)"><input value={v.offerText} maxLength={120} onChange={set("offerText")} placeholder={type === "sale" ? "e.g. Up to 50% off" : "e.g. Flat 20% off above ₹1,499"} /></Field>}
        {type === "offer" && (
          <Field label="Coupon (optional)" hint="Create coupons under Coupons">
            <select value={v.couponCode} onChange={set("couponCode")}>
              <option value="">No coupon</option>
              {(coupons.data || []).map((c) => <option key={c.id} value={c.code}>{c.code} — {c.type === "percent" ? `${c.value}% off` : `${money(c.value)} off`}{c.minSubtotal ? ` above ${money(c.minSubtotal)}` : ""}</option>)}
            </select>
          </Field>
        )}
        {type === "sale" && <>
          <Field label="Sale starts (optional)"><input type="datetime-local" value={v.startsAt} onChange={set("startsAt")} /></Field>
          <Field label="Sale ends (optional)"><input type="datetime-local" value={v.endsAt} min={v.startsAt || undefined} onChange={set("endsAt")} /></Field>
        </>}
        <Field label="Button text"><input value={v.ctaLabel} maxLength={40} onChange={set("ctaLabel")} /></Field>
        <Field label="Button link" hint="A store path like /products or a full https:// link"><input value={v.ctaUrl} maxLength={500} onChange={set("ctaUrl")} /></Field>
        {type === "new_arrival" && <Field label="Products to feature (required)" full><ProductPicker selected={v.products} onChange={(products) => setV((x) => ({ ...x, products }))} /></Field>}
      </div>
      {error && <div className="products-form-error" role="alert">{error}</div>}
    </Modal>
  );
}

/* ---------- Preview / test / send ---------- */
function PreviewModal({ campaign, onClose }) {
  const { data, error } = useAdminData(`/admin/notifications/${campaign.id}/preview`, { debounce: 0 });
  return (
    <Modal wide title={`Preview: ${campaign.title}`} eyebrow="EMAIL PREVIEW" onClose={onClose} footer={<button type="button" className="secondary-button" onClick={onClose}>Close</button>}>
      <ErrorBanner error={error} />
      {data ? <>
        <p className="ops-hint" style={{ marginTop: 0 }}>Subject: <b>{data.subject}</b></p>
        <iframe className="ops-email-frame" title="Email preview" sandbox="" srcDoc={data.html} />
      </> : !error && <p className="muted">Building preview…</p>}
    </Modal>
  );
}

function TestDialog({ campaign, onClose, onDone }) {
  const toast = useToast();
  const { user } = useAdminAuth();
  const [email, setEmail] = useState(user?.email || "");
  return (
    <ConfirmDialog title="Send a test email" confirmLabel="Send test" disabled={!/^\S+@\S+\.\S+$/.test(email)} onClose={onClose}
      message="Only this address gets the email, with “[TEST]” in the subject. Subscribers aren't emailed."
      onConfirm={async () => { await adminRequest(`/admin/notifications/${campaign.id}/test`, { method: "POST", body: JSON.stringify({ email }) }); toast(`Test sent to ${email}.`); onDone(); }}>
      <Field label="Send to" full><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
    </ConfirmDialog>
  );
}

/* Sends in batches until done; shows progress; can stop. */
function SendProgress({ campaign, onClose, onDone }) {
  const toast = useToast();
  const [c, setC] = useState(campaign);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    (async () => {
      let current = campaign;
      try {
        while (alive.current && ["draft", "sending"].includes(current.status)) {
          current = (await adminRequest(`/admin/notifications/${campaign.id}/send`, { method: "POST" })).data;
          if (alive.current) setC(current);
        }
        if (current.status === "sent") toast(`Sent to ${current.stats.sent} subscriber${current.stats.sent === 1 ? "" : "s"}${current.stats.failed ? ` (${current.stats.failed} failed)` : ""}.`);
      } catch (e) {
        if (alive.current) setError(e.message);
      } finally {
        onDone();
      }
    })();
    return () => { alive.current = false; };
  }, [campaign, onDone, toast]);
  const total = c.stats?.total || 0, done = (c.stats?.sent || 0) + (c.stats?.failed || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const finished = ["sent", "cancelled"].includes(c.status) || error;
  async function stop() {
    setStopping(true);
    alive.current = false;
    try { setC((await adminRequest(`/admin/notifications/${campaign.id}/cancel`, { method: "POST" })).data); toast("Sending stopped."); } catch (e) { setError(e.message); }
    onDone();
  }
  return (
    <Modal title={`Sending: ${campaign.title}`} eyebrow="NOTIFICATIONS" onClose={onClose} busy={!finished && !stopping} footer={finished
      ? <button type="button" className="primary-button" onClick={onClose}>Done</button>
      : <button type="button" className="ops-danger-button" disabled={stopping} onClick={stop}>{stopping ? "Stopping…" : "Stop sending"}</button>}>
      <div className="ops-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
      <p className="ops-confirm-text"><b>{done}</b> of <b>{total || "…"}</b> processed · {c.stats?.sent || 0} sent{c.stats?.failed ? ` · ${c.stats.failed} failed` : ""} · <Badge value={c.status === "sent" ? "completed" : c.status} /></p>
      {!finished && <p className="ops-hint">Keep this window open while sending. If it closes, open the notification and choose “Continue sending” — nobody gets the email twice.</p>}
      <ErrorBanner error={error} />
    </Modal>
  );
}

/* ---------- Campaign list ---------- */
const STATUS_BADGE = { draft: "pending", sending: "processing", sent: "completed", cancelled: "cancelled" };
function CampaignTable({ type, summary, refresh, onChanged, createKey = 0 }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState(null);
  const [test, setTest] = useState(null);
  const [confirmSend, setConfirmSend] = useState(null);
  const [sending, setSending] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const { data, meta, loading, error, reload } = useAdminData(`/admin/notifications?${qs({ type, status, q: q.trim(), page, limit: PAGE_SIZE, r: refresh })}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const changed = () => { reload(); onChanged(); };
  const openEditor = async (c) => setEditing(c ? (await adminRequest(`/admin/notifications/${c.id}`)).data : {});
  const canSend = summary?.emailConfigured && summary?.subscribers > 0;
  // The page heading's "New …" button bumps createKey to open a blank editor here.
  const createSeen = useRef(createKey); // ignore clicks made before this table mounted
  useEffect(() => { if (createKey !== createSeen.current) { createSeen.current = createKey; setEditing({}); } }, [createKey]);
  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>{type ? TYPES[type].short : "All notifications"}</h2><p className="muted">{type ? "Drafts can be edited, previewed and test-sent before sending." : "Every notification sent or drafted, of every type."}</p></div>
        <div className="ops-filters">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or subject…" aria-label="Search notifications" />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
            <option value="">All statuses</option><option value="draft">Draft</option><option value="sending">Sending</option><option value="sent">Sent</option><option value="cancelled">Stopped</option>
          </select>
          <ExportButton path={`/admin/notifications/export.csv?${qs({ type })}`} filename={`shoponzy-notifications${type ? `-${type}` : ""}`} disabled={!meta?.total} />
        </div>
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Notification</th>{!type && <th>Type</th>}<th>Status</th><th className="num">Recipients</th><th className="num">Sent</th><th className="num">Failed</th><th>Created / sent</th><th>Actions</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={type ? 7 : 8} empty="No notifications yet" emptyHint={type ? `Choose “${TYPES[type].create}” at the top right to write your first one.` : "Create one from New Arrivals, Offers & Discounts or Sales & Promotions."}>
            {rows.map((c) => (
              <tr key={c.id}>
                <td style={{ maxWidth: 380 }}><strong>{c.title}</strong><small>{c.subject}</small></td>
                {!type && <td>{TYPES[c.type]?.short || titleCase(c.type)}</td>}
                <td><Badge value={STATUS_BADGE[c.status]} label={c.status === "cancelled" ? "Stopped" : titleCase(c.status)} /></td>
                <td className="num">{c.stats?.total || "—"}</td>
                <td className="num">{c.stats?.sent || 0}</td>
                <td className="num">{c.stats?.failed || 0}</td>
                <td className="ops-nowrap">{dateTime(c.createdAt)}<small>{c.sentAt ? `Sent ${dateTime(c.sentAt)}${c.sentBy?.name ? ` by ${c.sentBy.name}` : ""}` : c.createdBy?.name ? `by ${c.createdBy.name}` : ""}</small></td>
                <td><div className="ops-actions">
                  {c.status === "draft" && <button type="button" className="table-action" disabled={!canSend} title={canSend ? undefined : "Email isn't set up or there are no subscribers"} onClick={() => setConfirmSend(c)}>Send</button>}
                  {c.status === "sending" && <button type="button" className="table-action" onClick={() => setSending(c)}>Continue sending</button>}
                  {["sent", "cancelled"].includes(c.status) && <button type="button" className="table-action" onClick={() => setPreview(c)}>View</button>}
                  <MoreMenu label={`More actions for ${c.title}`} items={[
                    { label: "Preview email", onClick: () => setPreview(c) },
                    ...(c.status === "draft" ? [{ label: "Edit draft", onClick: () => openEditor(c).catch((e) => toast(e.message, "error")) }] : []),
                    ...(summary?.emailConfigured ? [{ label: "Send me a test", onClick: () => setTest(c) }] : []),
                    ...(["draft", "cancelled"].includes(c.status) ? [{ label: "Delete", onClick: () => setDeleting(c) }] : []),
                  ]} />
                </div></td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      <Pagination meta={meta} page={page} onPage={setPage} />
      {editing && <CampaignEditor type={editing.type || type} campaign={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={changed} />}
      {preview && <PreviewModal campaign={preview} onClose={() => setPreview(null)} />}
      {test && <TestDialog campaign={test} onClose={() => setTest(null)} onDone={changed} />}
      {confirmSend && <ConfirmDialog title={`Send “${confirmSend.title}”?`} confirmLabel={`Send to ${summary?.subscribers} subscriber${summary?.subscribers === 1 ? "" : "s"}`} onClose={() => setConfirmSend(null)}
        message={<>This emails <b>{summary?.subscribers}</b> newsletter subscriber{summary?.subscribers === 1 ? "" : "s"}. It can’t be unsent. Send yourself a test first if you haven’t.</>}
        onConfirm={async () => { setSending(confirmSend); }} />}
      {sending && <SendProgress campaign={sending} onClose={() => { setSending(null); changed(); }} onDone={reload} />}
      {deleting && <ConfirmDialog title="Delete this notification?" tone="danger" confirmLabel="Delete" onClose={() => setDeleting(null)} message={<>“{deleting.title}” will be deleted.</>}
        onConfirm={async () => { await adminRequest(`/admin/notifications/${deleting.id}`, { method: "DELETE" }); toast("Notification deleted."); changed(); }} />}
    </section>
  );
}

/* ---------- Email Notifications: switches + log ---------- */
const SWITCHES = [
  ["orderConfirmation", "Order confirmation", "When an order is placed (COD) or paid online"],
  ["orderShipped", "Order shipped", "With the courier and tracking link"],
  ["orderDelivered", "Order delivered", "When the order is marked delivered"],
  ["orderCancelled", "Order cancelled", "Including refund information for paid orders"],
  ["returnUpdates", "Return updates", "Return approved, rejected, and refund issued"],
  ["supportAutoReply", "Support auto-reply", "Confirms we received a contact-form message"],
];
const EMAIL_TYPES = { order_confirmation: "Order confirmation", order_status: "Order update", return_update: "Return update", support_reply: "Support reply", support_ack: "Support auto-reply", campaign: "Promotion", test: "Test", password_reset: "Password reset", other: "Other" };

function EmailSettings({ onChanged }) {
  const toast = useToast();
  const { data, error, reload } = useAdminData("/admin/notifications/settings", { debounce: 0 });
  const [saving, setSaving] = useState("");
  async function flip(key, value) {
    setSaving(key);
    try {
      await adminRequest("/admin/notifications/settings", { method: "PUT", body: JSON.stringify({ [key]: value }) });
      toast(`${SWITCHES.find((s) => s[0] === key)[1]} emails ${value ? "turned on" : "turned off"}.`);
      await reload();
      onChanged();
    } catch (e) { toast(e.message, "error"); } finally { setSaving(""); }
  }
  return (
    <section className="panel">
      <div className="ops-toolbar"><div><h2>Automatic emails</h2><p className="muted">Order and return updates go to the customer’s email from checkout. Turn off any you don’t want sent.</p></div></div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="ops-switches">
        {SWITCHES.map(([key, label, hint]) => (
          <label key={key} className="ops-switch-row">
            <span><strong>{label}</strong><small>{hint}</small></span>
            <input type="checkbox" role="switch" checked={Boolean(data?.settings?.[key])} disabled={!data || saving === key} onChange={(e) => flip(key, e.target.checked)} aria-label={`${label} emails`} />
          </label>
        ))}
      </div>
    </section>
  );
}

function EmailLog() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const filters = { q: q.trim(), type, status, from: dayStart(from), to: dayEnd(to) };
  const { data, meta, loading, error, reload } = useAdminData(`/admin/notifications/email-log?${qs({ ...filters, page, limit: PAGE_SIZE })}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const reset = (fn) => (e) => { fn(e.target.value); setPage(1); };
  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>Email log</h2><p className="muted">Every email the store tried to send in the last 90 days, and whether it went out.</p></div>
        <div className="ops-filters">
          <input type="search" value={q} onChange={reset(setQ)} placeholder="Search recipient, subject or order…" aria-label="Search email log" />
          <select value={type} onChange={reset(setType)} aria-label="Filter by type"><option value="">All types</option>{Object.entries(EMAIL_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={status} onChange={reset(setStatus)} aria-label="Filter by result"><option value="">All results</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="skipped">Not sent (email off)</option></select>
          <div className="ops-daterange" role="group" aria-label="Date range"><span>From</span><input type="date" aria-label="From date" value={from} max={to || undefined} onChange={reset(setFrom)} /><span>To</span><input type="date" aria-label="To date" value={to} min={from || undefined} onChange={reset(setTo)} /></div>
          <ExportButton path={`/admin/notifications/email-log/export.csv?${qs(filters)}`} filename="shoponzy-email-log" disabled={!meta?.total} />
        </div>
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Date &amp; time</th><th>To</th><th>Subject</th><th>Type</th><th>Result</th><th>Reference</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={6} empty="No emails yet" emptyHint="Order, return, support and promotional emails appear here as they are sent.">
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="ops-nowrap">{dateTime(e.createdAt)}</td>
                <td>{e.to}</td>
                <td style={{ maxWidth: 360 }}>{e.subject}</td>
                <td>{EMAIL_TYPES[e.type] || e.type}</td>
                <td><Badge value={e.status === "sent" ? "completed" : e.status === "failed" ? "failed" : "inactive"} label={e.status === "skipped" ? "Not sent" : titleCase(e.status)} />{e.error && <small>{e.error}</small>}</td>
                <td className="mono">{e.ref || "—"}</td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      <Pagination meta={meta} page={page} onPage={setPage} />
    </section>
  );
}

/* ---------- Page ---------- */
const VIEW = {
  arrivals: ["New Arrivals", "Announce new products to your newsletter subscribers.", "new_arrival"],
  offers: ["Offers & Discounts", "Email offers and discount codes to your newsletter subscribers.", "offer"],
  sales: ["Sales & Promotions", "Announce sales and special promotions to your newsletter subscribers.", "sale"],
  email: ["Email Notifications", "Choose which order, return and support emails are sent automatically, and see every email the store sends.", null],
  history: ["Notification History", "All promotional emails — drafts, sent and stopped — with delivery counts.", null],
};

export default function NotificationsPage({ view = "arrivals" }) {
  const [refresh, setRefresh] = useState(0);
  const [createKey, setCreateKey] = useState(0);
  const summary = useAdminData(`/admin/notifications/summary?r=${refresh}`, { debounce: 0 });
  const s = summary.data;
  const [title, description, type] = VIEW[view] || VIEW.arrivals;
  const changed = () => setRefresh((r) => r + 1);
  const cards = [
    { label: "Newsletter subscribers", value: s ? String(s.subscribers) : "", tone: "green", note: s ? `${s.unsubscribed} unsubscribed` : "" },
    { label: "Drafts", value: s ? String(s.campaigns.draft) : "", tone: "amber" },
    { label: "Notifications sent", value: s ? String(s.campaigns.sent) : "", note: s?.campaigns.sending ? `${s.campaigns.sending} still sending` : "" },
    { label: "Emails sent (30 days)", value: s ? String(s.last30Days.sent) : "", tone: "green", note: "orders, returns, support & promotions" },
    { label: "Failed / not sent (30 days)", value: s ? String(s.last30Days.failed + s.last30Days.skipped) : "", tone: "red" },
  ];
  return (
    <>
      <PageHeading eyebrow="NOTIFICATIONS" title={title} description={description}
        actions={type && <button type="button" className="primary-button" onClick={() => setCreateKey((k) => k + 1)}>＋ {TYPES[type].create}</button>} />
      <ErrorBanner error={summary.error} onRetry={summary.reload} />
      {s && !s.emailConfigured && (
        <div className="ops-callout warn" role="status"><b>Email sending isn’t set up yet.</b> Add your SMTP settings (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM) to the backend’s environment on Vercel. Until then you can prepare drafts, but nothing can be sent and order emails are skipped.</div>
      )}
      {s && s.emailConfigured && type && !s.subscribers && <div className="ops-callout" role="status">No one has subscribed to the newsletter yet, so there’s nobody to send to. Customers subscribe from the storefront footer.</div>}
      <StatCards items={cards} loading={!s && summary.loading} />
      {type && <CampaignTable key={type} type={type} summary={s} refresh={refresh} onChanged={changed} createKey={createKey} />}
      {view === "email" && <div className="ops-stack">
        {s?.emailConfigured && <div className="ops-callout" role="status">Email is set up. Emails are sent from <b>{s.mailFrom}</b>.</div>}
        <EmailSettings onChanged={changed} />
        <EmailLog />
      </div>}
      {view === "history" && <CampaignTable key="all" summary={s} refresh={refresh} onChanged={changed} />}
    </>
  );
}
