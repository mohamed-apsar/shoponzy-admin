import { useState } from "react";
import { adminRequest } from "../api/adminApi";
import { dateTime, money, shortDate, titleCase } from "../utils/format";
import {
  Badge, ConfirmDialog, ErrorBanner, ExportButton, Field, KeyValues, Modal, PageHeading, Pagination, StatCards, TableBody, Thumb,
  dayEnd, dayStart, qs, useAdminData, useToast,
} from "./ops/OpsKit";

/* eslint-disable react/prop-types */
const PAGE_SIZE = 20;
const STATUSES = ["requested", "approved", "rejected", "pickup_scheduled", "in_transit", "received", "inspected", "completed", "cancelled"];
const REFUND_STATUSES = ["not_applicable", "pending", "processing", "completed", "failed"];
const CONDITIONS = [["good", "Good — resellable"], ["opened", "Opened / used lightly"], ["damaged", "Damaged"], ["unsellable", "Unsellable"]];

/* ---------- Actions ---------- */
function ApproveDialog({ rr, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  return (
    <ConfirmDialog title={`Approve ${rr.returnNumber}?`} confirmLabel="Approve return" onClose={onClose}
      message={<>The customer’s return of {rr.quantity} item(s) from order #{rr.orderNumber} will be accepted. {rr.refund.maxAmount > 0 ? <>A refund of up to <b>{money(rr.refund.maxAmount)}</b> becomes due — it’s issued only after the items are received and inspected.</> : "No refund is due (the order wasn’t paid)."} Stock doesn’t change until inspection.</>}
      onConfirm={async () => { await adminRequest(`/admin/returns/${rr.id}/approve`, { method: "POST", body: JSON.stringify({ note: note.trim() || undefined }) }); toast(`${rr.returnNumber} approved.`); onDone(); }}>
      <Field label="Admin note (optional)" full><textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
    </ConfirmDialog>
  );
}

function RejectDialog({ rr, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <ConfirmDialog title={`Reject ${rr.returnNumber}?`} tone="danger" confirmLabel="Reject return" disabled={reason.trim().length < 3} onClose={onClose}
      message="The customer will see the rejection reason on their order page. Nothing is refunded or restocked."
      onConfirm={async () => { await adminRequest(`/admin/returns/${rr.id}/reject`, { method: "POST", body: JSON.stringify({ reason: reason.trim(), note: note.trim() || undefined }) }); toast(`${rr.returnNumber} rejected.`); onDone(); }}>
      <div className="ops-form">
        <Field label="Rejection reason (shown to customer)" full><textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The item shows signs of use and is outside our return policy." /></Field>
        <Field label="Internal note (optional)" full><input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </ConfirmDialog>
  );
}

function StatusDialog({ rr, status, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [pickup, setPickup] = useState({ courier: rr.pickup?.courier || "", trackingNumber: rr.pickup?.trackingNumber || "", scheduledAt: "" });
  const copy = {
    pickup_scheduled: ["Schedule pickup", "Record the courier pickup for this return."],
    in_transit: ["Mark in transit", "The parcel is on its way back to you."],
    received: ["Mark received", "Confirm the parcel has arrived. Stock is updated at the next step, inspection."],
    completed: ["Complete return", "Close this return. If every item of the order has come back, the order is marked Returned."],
    cancelled: ["Cancel return", "The return request is closed without a refund."],
  }[status];
  const body = () => {
    const p = Object.fromEntries(Object.entries({ ...pickup, scheduledAt: pickup.scheduledAt ? new Date(pickup.scheduledAt).toISOString() : "" }).filter(([, v]) => v));
    return { status, note: note.trim() || undefined, ...(status === "pickup_scheduled" && Object.keys(p).length ? { pickup: p } : {}) };
  };
  return (
    <ConfirmDialog title={`${copy[0]} — ${rr.returnNumber}`} confirmLabel={copy[0]} tone={status === "cancelled" ? "danger" : "primary"} onClose={onClose} message={copy[1]}
      onConfirm={async () => { await adminRequest(`/admin/returns/${rr.id}/status`, { method: "POST", body: JSON.stringify(body()) }); toast(`${rr.returnNumber}: ${titleCase(status)}.`); onDone(); }}>
      <div className="ops-form">
        {status === "pickup_scheduled" && <>
          <Field label="Courier"><input value={pickup.courier} maxLength={60} onChange={(e) => setPickup((p) => ({ ...p, courier: e.target.value }))} /></Field>
          <Field label="Tracking number"><input value={pickup.trackingNumber} maxLength={60} onChange={(e) => setPickup((p) => ({ ...p, trackingNumber: e.target.value }))} /></Field>
          <Field label="Pickup date"><input type="datetime-local" value={pickup.scheduledAt} onChange={(e) => setPickup((p) => ({ ...p, scheduledAt: e.target.value }))} /></Field>
        </>}
        <Field label="Note (optional)" full><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </ConfirmDialog>
  );
}

function InspectDialog({ rr, onClose, onDone }) {
  const toast = useToast();
  const [items, setItems] = useState(rr.items.map((it, index) => ({ index, condition: "good", restockQty: it.qty })));
  const [notes, setNotes] = useState("");
  const set = (i, patch) => setItems((all) => all.map((x) => (x.index === i ? { ...x, ...patch, ...(patch.condition === "unsellable" ? { restockQty: 0 } : {}) } : x)));
  const total = items.reduce((s, i) => s + Number(i.restockQty || 0), 0);
  const valid = items.every((x, i) => Number.isInteger(Number(x.restockQty)) && x.restockQty >= 0 && x.restockQty <= rr.items[i].qty && !(x.condition === "unsellable" && x.restockQty > 0));
  return (
    <ConfirmDialog title={`Inspect ${rr.returnNumber}`} confirmLabel={total ? `Save & restock ${total} unit(s)` : "Save inspection"} disabled={!valid} onClose={onClose}
      message="Record each item’s condition. Only the units you restock are added back to available stock (recorded in the stock history)."
      onConfirm={async () => { await adminRequest(`/admin/returns/${rr.id}/inspect`, { method: "POST", body: JSON.stringify({ items: items.map((x) => ({ ...x, restockQty: Number(x.restockQty) })), notes: notes.trim() || undefined }) }); toast(`${rr.returnNumber} inspected${total ? `; ${total} unit(s) restocked` : ""}.`); onDone(); }}>
      {rr.items.map((it, i) => (
        <div key={i} className="ops-form" style={{ alignItems: "end", paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #eef0f6" }}>
          <div className="ops-product ops-field full"><Thumb src={it.image} /><div><strong>{it.name}</strong><small>{[it.color, it.size, it.sku].filter(Boolean).join(" · ")} · returned {it.qty}</small></div></div>
          <Field label="Condition"><select value={items[i].condition} onChange={(e) => set(i, { condition: e.target.value })}>{CONDITIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          <Field label={`Restock (0–${it.qty})`}><input type="number" min={0} max={it.qty} step={1} disabled={items[i].condition === "unsellable"} value={items[i].restockQty} onChange={(e) => set(i, { restockQty: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
        </div>
      ))}
      <Field label="Inspection notes" full><textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} /></Field>
    </ConfirmDialog>
  );
}

function RefundDialog({ rr, onClose, onDone }) {
  const toast = useToast();
  const max = rr.refund.maxAmount;
  const [amount, setAmount] = useState(String(max));
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const cod = rr.order?.paymentMethod === "cod";
  const n = Number(amount);
  const valid = n > 0 && n <= max && (!cod || reference.trim());
  return (
    <ConfirmDialog title={`Refund ${rr.returnNumber}`} tone="danger" confirmLabel={`Refund ${money(valid ? n : 0)}`} disabled={!valid} onClose={onClose}
      message={cod
        ? "This order was paid in cash. Pay the customer by bank transfer / UPI, then record the reference here."
        : <>The refund goes to Razorpay against payment <span className="ops-mono">{rr.refund.originalPaymentId}</span>. It shows as Processing until Razorpay confirms it.</>}
      onConfirm={async () => {
        const updated = (await adminRequest(`/admin/returns/${rr.id}/refund`, { method: "POST", body: JSON.stringify({ amount: n, manualReference: cod ? reference.trim() : undefined, note: note.trim() || undefined }) })).data;
        toast(updated.refund.status === "completed" ? `Refund of ${money(n)} completed.` : `Refund of ${money(n)} sent to Razorpay — processing.`);
        onDone();
      }}>
      <div className="ops-form">
        <Field label={`Amount (max ${money(max)})`} hint="What the customer paid for these items, after discounts. Delivery fees aren’t included."><input type="number" min={0.01} max={max} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        {cod && <Field label="Bank / UPI reference"><input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} /></Field>}
        <Field label="Note (optional)" full><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </ConfirmDialog>
  );
}

/* ---------- Detail ---------- */
function ReturnDetail({ id, onClose, onChanged }) {
  const toast = useToast();
  const { data: rr, error, loading, reload } = useAdminData(`/admin/returns/${id}`, { debounce: 0 });
  const [action, setAction] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const done = () => { reload(); onChanged(); };
  const r = rr?.refund;
  const canRefund = rr && ["inspected", "completed"].includes(rr.status) && ["pending", "failed"].includes(r?.status) && r.maxAmount > 0;

  async function sync() {
    setSyncing(true);
    try {
      const res = (await adminRequest(`/admin/transactions/${r.originalTransactionId}/refunds/${encodeURIComponent(r.refundId)}/sync`, { method: "POST" })).data;
      toast(res.changed ? `Razorpay reports the refund as ${res.status}.` : `Still ${res.status} at Razorpay.`);
      done();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSyncing(false);
    }
  }

  const buttons = rr ? [
    rr.status === "requested" && <button key="rej" type="button" className="ops-danger-button" onClick={() => setAction({ type: "reject" })}>Reject</button>,
    rr.status === "requested" && <button key="ap" type="button" className="primary-button" onClick={() => setAction({ type: "approve" })}>Approve</button>,
    ...["pickup_scheduled", "in_transit", "received"].filter((s) => rr.allowedStatuses.includes(s)).map((s) => (
      <button key={s} type="button" className={s === "received" ? "primary-button" : "secondary-button"} onClick={() => setAction({ type: "status", status: s })}>{{ pickup_scheduled: "Schedule pickup", in_transit: "Mark in transit", received: "Mark received" }[s]}</button>
    )),
    rr.status === "received" && <button key="in" type="button" className="primary-button" onClick={() => setAction({ type: "inspect" })}>Inspect items</button>,
    canRefund && <button key="rf" type="button" className="ops-danger-button" onClick={() => setAction({ type: "refund" })}>{r.status === "failed" ? "Retry refund" : "Issue refund"}</button>,
    r?.status === "processing" && r.refundId && r.originalTransactionId && <button key="sy" type="button" className="secondary-button" disabled={syncing} onClick={sync}>{syncing ? "Checking…" : "Check refund status"}</button>,
    rr.allowedStatuses.includes("completed") && <button key="co" type="button" className="primary-button" disabled={["pending", "processing", "failed"].includes(r?.status)} title={["pending", "processing", "failed"].includes(r?.status) ? "Complete the refund first" : undefined} onClick={() => setAction({ type: "status", status: "completed" })}>Complete return</button>,
    rr.allowedStatuses.includes("cancelled") && <button key="ca" type="button" className="secondary-button" onClick={() => setAction({ type: "status", status: "cancelled" })}>Cancel return</button>,
  ].filter(Boolean) : [];

  return (
    <Modal wide title={rr ? `Return ${rr.returnNumber}` : "Return request"} eyebrow="RETURN REQUEST" onClose={onClose} footer={<><button type="button" className="secondary-button" onClick={onClose}>Close</button>{buttons}</>}>
      <ErrorBanner error={error} onRetry={reload} />
      {!rr && loading && <p className="muted">Loading…</p>}
      {rr && <>
        <KeyValues rows={[
          ["Return status", <Badge key="s" value={rr.status} />],
          ["Refund status", <Badge key="r" value={r.status} />],
          ["Order", rr.order ? `#${rr.order.orderNumber} · ${titleCase(rr.order.status)}` : `#${rr.orderNumber}`],
          ["Customer", <span key="c">{rr.customer?.name}<br /><small className="muted">{[rr.customer?.phone, rr.customer?.email].filter(Boolean).join(" · ")}</small></span>],
          ["Reason", rr.reasonLabel],
          ["Requested", dateTime(rr.createdAt)],
          ["Decision", rr.decidedAt ? `${dateTime(rr.decidedAt)}${rr.decidedBy ? ` by ${rr.decidedBy.name}` : ""}` : "—"],
          ["Received", dateTime(rr.receivedAt)],
          ["Inspected", rr.inspectedAt ? `${dateTime(rr.inspectedAt)}${rr.inspectedBy ? ` by ${rr.inspectedBy.name}` : ""}` : "—"],
          rr.pickup?.courier || rr.pickup?.trackingNumber ? ["Pickup", [rr.pickup.courier, rr.pickup.trackingNumber, rr.pickup.scheduledAt && dateTime(rr.pickup.scheduledAt)].filter(Boolean).join(" · ")] : null,
        ]} />
        {rr.comments && <><h3 className="ops-section-title">Customer comments</h3><div className="ops-note">{rr.comments}</div></>}
        {rr.rejectionReason && <><h3 className="ops-section-title">Rejection reason</h3><div className="ops-note">{rr.rejectionReason}</div></>}
        {rr.adminNote && <><h3 className="ops-section-title">Admin note</h3><div className="ops-note">{rr.adminNote}</div></>}

        <h3 className="ops-section-title">Items</h3>
        <div className="table-scroll"><table className="ops-table" style={{ minWidth: 620 }}>
          <thead><tr><th>Product</th><th>SKU</th><th className="num">Qty</th><th className="num">Unit price</th><th>Condition</th><th className="num">Restocked</th></tr></thead>
          <tbody>{rr.items.map((it, i) => (
            <tr key={i}><td><div className="ops-product"><Thumb src={it.image} /><div><strong>{it.name}</strong><small>{[it.color, it.size].filter(Boolean).join(" / ") || "—"}</small></div></div></td>
              <td className="mono">{it.sku || "—"}</td><td className="num">{it.qty}</td><td className="num">{money(it.price)}</td>
              <td>{it.condition ? titleCase(it.condition) : <span className="muted">Not inspected</span>}</td><td className="num">{it.condition ? it.restockedQty : "—"}</td></tr>
          ))}</tbody>
        </table></div>
        {rr.inspectionNotes && <p className="ops-hint">Inspection notes: {rr.inspectionNotes}</p>}
        {!!rr.evidence.length && <><h3 className="ops-section-title">Customer photos</h3><div className="ops-gallery">{rr.evidence.map((e) => <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer"><img src={e.url} alt="Return evidence" loading="lazy" /></a>)}</div></>}

        <h3 className="ops-section-title">Refund</h3>
        <KeyValues rows={[
          ["Refund status", <Badge key="rs" value={r.status} />],
          ["Refund amount", r.amount !== null ? money(r.amount) : "—"],
          ["pending", "failed"].includes(r.status) ? ["Refundable for these items", money(r.maxAmount)] : null,
          ["Refund ID", r.refundId ? <span key="ri" className="ops-mono">{r.refundId}</span> : "—"],
          ["Original payment ID", r.originalPaymentId ? <span key="op" className="ops-mono">{r.originalPaymentId}</span> : rr.order?.paymentMethod === "cod" ? "Cash on delivery" : "—"],
          ["Original transaction ID", r.originalTransactionId ? <span key="ot" className="ops-mono">{r.originalTransactionId}</span> : "—"],
          ["Initiated", dateTime(r.initiatedAt)],
          ["Completed", dateTime(r.completedAt)],
        ]} />
        {r.failureReason && <div className="ops-error"><span><b>Refund failed:</b> {r.failureReason}</span></div>}
        {rr.status === "approved" && r.status === "pending" && <p className="ops-hint">The refund can be issued once the items are received and inspected.</p>}

        <h3 className="ops-section-title">Audit trail</h3>
        <ul className="ops-timeline">{rr.history.map((h, i) => (
          <li key={i}><b>{h.status ? titleCase(h.status) : `Refund ${titleCase(h.refundStatus || "")}`}</b>{h.note && ` — ${h.note}`}<small>{dateTime(h.at)}{h.by ? ` · ${h.by}` : ""}</small></li>
        ))}</ul>
      </>}
      {action?.type === "approve" && <ApproveDialog rr={rr} onClose={() => setAction(null)} onDone={done} />}
      {action?.type === "reject" && <RejectDialog rr={rr} onClose={() => setAction(null)} onDone={done} />}
      {action?.type === "status" && <StatusDialog rr={rr} status={action.status} onClose={() => setAction(null)} onDone={done} />}
      {action?.type === "inspect" && <InspectDialog rr={rr} onClose={() => setAction(null)} onDone={done} />}
      {action?.type === "refund" && <RefundDialog rr={rr} onClose={() => setAction(null)} onDone={done} />}
    </Modal>
  );
}

/* ---------- Lists ---------- */
function ReturnsTable({ view, status: fixedStatus, title, description, onOpen, refreshKey, reasons = [], compact = false }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [refundStatus, setRefundStatus] = useState("");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const params = { view, status: fixedStatus || status, refundStatus, reason, q: q.trim(), from: dayStart(from), to: dayEnd(to), page, limit: compact ? 6 : PAGE_SIZE, r: refreshKey };
  const { data, meta, loading, error, reload } = useAdminData(`/admin/returns?${qs(params)}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  const reset = (fn) => (v) => { fn(v); setPage(1); };
  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>{title}</h2>{description && <p className="muted">{description}</p>}</div>
        {!compact && (
          <div className="ops-filters">
            <input type="search" value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Return/order ID, customer or product…" aria-label="Search returns" />
            {!fixedStatus && view !== "refunds" && (
              <select value={status} onChange={(e) => reset(setStatus)(e.target.value)} aria-label="Filter by return status">
                <option value="">All return statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </select>
            )}
            {!!reasons.length && (
              <select value={reason} onChange={(e) => reset(setReason)(e.target.value)} aria-label="Filter by return reason">
                <option value="">All reasons</option>{reasons.map((r) => <option key={r.code} value={r.code}>{r.label}{r.active ? "" : " (disabled)"}</option>)}
              </select>
            )}
            <select value={refundStatus} onChange={(e) => reset(setRefundStatus)(e.target.value)} aria-label="Filter by refund status">
              <option value="">All refund statuses</option>{REFUND_STATUSES.filter((s) => view !== "refunds" || s !== "not_applicable").map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
            <div className="ops-daterange" role="group" aria-label="Date range"><span>From</span><input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} /><span>To</span><input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} /></div>
            <ExportButton path={`/admin/returns/export.csv?${qs({ view, status: fixedStatus || status, refundStatus, reason, q: q.trim(), from: dayStart(from), to: dayEnd(to) })}`}
              filename={`shoponzy-returns${view ? `-${view}` : fixedStatus ? `-${fixedStatus}` : ""}`} disabled={!meta?.total} />
          </div>
        )}
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Return</th><th>Customer</th><th>Product</th><th className="num">Qty</th><th>Reason</th><th>Requested</th><th>Return status</th><th>Refund</th><th>Actions</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={9} empty="No return requests found" emptyHint={q || status || refundStatus || from || to ? "Try clearing the search or filters." : "Customers request returns from their order page after delivery."}>
            {rows.map((rr) => {
              const first = rr.items[0] || {};
              return (
                <tr key={rr.id}>
                  <td><button type="button" className="ops-link" onClick={() => onOpen(rr.id)}>{rr.returnNumber}</button><small>Order #{rr.orderNumber}</small></td>
                  <td>{rr.customer?.name || "—"}{rr.customer?.phone && <small>{rr.customer.phone}</small>}</td>
                  <td><div className="ops-product"><Thumb src={first.image} /><div><strong>{first.name}</strong><small>{[[first.color, first.size].filter(Boolean).join(" / "), first.sku].filter(Boolean).join(" · ")}{rr.items.length > 1 ? ` · +${rr.items.length - 1} more` : ""}</small></div></div></td>
                  <td className="num">{rr.quantity}</td>
                  <td>{rr.reasonLabel}</td>
                  <td>{shortDate(rr.createdAt)}</td>
                  <td><Badge value={rr.status} /></td>
                  <td><Badge value={rr.refund.status} />{rr.refund.amount !== null && rr.refund.status !== "not_applicable" && <small>{money(rr.refund.amount)}</small>}</td>
                  <td><button type="button" className="table-action" onClick={() => onOpen(rr.id)}>{rr.status === "requested" ? "Review" : "View"}</button></td>
                </tr>
              );
            })}
          </TableBody>
        </table>
      </div>
      {!compact && <Pagination meta={meta} page={page} onPage={setPage} />}
    </section>
  );
}

function ReturnedItemsTable({ onOpen, refreshKey }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useAdminData(`/admin/returns/items?${qs({ q: q.trim(), status, page, limit: PAGE_SIZE, r: refreshKey })}`, { debounce: q ? 300 : 0 });
  const rows = data || [];
  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>Returned products</h2><p className="muted">Each item in an approved return — where it is, its condition and what went back into stock.</p></div>
        <div className="ops-filters">
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Product, SKU, return or order…" aria-label="Search returned products" />
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by return status">
            <option value="">All approved returns</option>{["approved", "pickup_scheduled", "in_transit", "received", "inspected", "completed"].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
          <ExportButton path={`/admin/returns/items/export.csv?${qs({ q: q.trim(), status })}`} filename="shoponzy-returned-products" disabled={!meta?.total} />
        </div>
      </div>
      <ErrorBanner error={error} onRetry={reload} />
      <div className="table-scroll">
        <table className="ops-table">
          <thead><tr><th>Product</th><th>SKU</th><th className="num">Qty</th><th>Order</th><th>Return</th><th>Requested</th><th>Approved</th><th>Received</th><th>Condition</th><th className="num">Restocked</th><th>Inspection notes</th><th>Status</th></tr></thead>
          <TableBody loading={loading} items={rows} columns={12} empty="No returned products yet" emptyHint="Items appear here once a return is approved.">
            {rows.map((it, i) => (
              <tr key={`${it.returnId}-${i}`}>
                <td><div className="ops-product"><Thumb src={it.image} /><div><strong>{it.name}</strong><small>{it.variant || "—"}</small></div></div></td>
                <td className="mono">{it.sku || "—"}</td><td className="num">{it.qty}</td><td>#{it.orderNumber}</td>
                <td><button type="button" className="ops-link" onClick={() => onOpen(it.returnId)}>{it.returnNumber}</button></td>
                <td>{shortDate(it.requestedAt)}</td><td>{shortDate(it.approvedAt)}</td><td>{shortDate(it.receivedAt)}</td>
                <td>{it.condition ? titleCase(it.condition) : <span className="muted">—</span>}</td>
                <td className="num">{it.condition ? it.restockedQty : "—"}</td>
                <td>{it.inspectionNotes || <span className="muted">—</span>}</td>
                <td><Badge value={it.status} /></td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      <Pagination meta={meta} page={page} onPage={setPage} />
    </section>
  );
}

/* ---------- Return reasons (offered to customers on the return form) ---------- */
function ReasonsManager({ reasons, loading, error, onReload, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null); // edited copy of the list; null = no unsaved changes
  const [newLabel, setNewLabel] = useState("");
  const [newNeedsComment, setNewNeedsComment] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const list = draft || reasons || [];
  const edit = (code, patch) => setDraft(list.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  const move = (index, dir) => { const next = [...list]; [next[index], next[index + dir]] = [next[index + dir], next[index]]; setDraft(next); };
  const remove = (code) => setDraft(list.filter((r) => r.code !== code));
  const dupe = (label, code) => list.some((r) => r.code !== code && r.label.trim().toLowerCase() === label.trim().toLowerCase());
  const problems = [
    list.some((r) => r.label.trim().length < 2) && "Every reason needs a name.",
    list.some((r) => dupe(r.label, r.code)) && "Two reasons have the same name.",
    !list.some((r) => r.active) && "Keep at least one reason active.",
  ].filter(Boolean);

  function add() {
    const label = newLabel.trim();
    if (label.length < 2 || dupe(label)) return;
    setDraft([...list, { code: `new:${Date.now()}`, label, active: true, requiresComment: newNeedsComment, used: 0, isNew: true }]);
    setNewLabel("");
    setNewNeedsComment(false);
  }

  async function save() {
    const body = { reasons: list.map((r) => ({ ...(r.isNew ? {} : { code: r.code }), label: r.label.trim(), active: r.active, requiresComment: r.requiresComment })) };
    await adminRequest("/admin/returns/reasons", { method: "PUT", body: JSON.stringify(body) });
    toast("Return reasons saved. Customers see the active ones on the return form.");
    setDraft(null);
    onSaved();
  }

  return (
    <section className="panel table-panel">
      <div className="ops-toolbar">
        <div><h2>Return reasons</h2><p className="muted">The reasons customers choose from when they request a return, in this order. Disabled reasons are hidden from customers; a reason already used by a return can be renamed or disabled but not deleted.</p></div>
        <div className="ops-filters">
          {!draft && <ExportButton path="/admin/returns/reasons.csv" filename="shoponzy-return-reasons" disabled={!list.length} />}
          {draft && <button type="button" className="secondary-button" onClick={() => setDraft(null)}>Discard changes</button>}
          <button type="button" className="primary-button" disabled={!draft || problems.length > 0} onClick={() => setConfirm(true)}>Save reasons</button>
        </div>
      </div>
      <ErrorBanner error={error} onRetry={onReload} />
      {draft && problems.length > 0 && <div className="ops-error" role="alert"><span>{problems[0]}</span></div>}
      <div className="table-scroll">
        <table className="ops-table" style={{ minWidth: 700 }}>
          <thead><tr><th>Order</th><th>Reason shown to customers</th><th>Comment required</th><th>Active</th><th className="num">Used by</th><th>Actions</th></tr></thead>
          <TableBody loading={loading} items={list} columns={6} empty="No reasons yet">
            {list.map((r, i) => (
              <tr key={r.code}>
                <td><div className="ops-actions">
                  <button type="button" className="table-action" aria-label={`Move ${r.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="table-action" aria-label={`Move ${r.label} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                </div></td>
                <td><input className="ops-inline-input" value={r.label} maxLength={80} aria-label="Reason name" onChange={(e) => edit(r.code, { label: e.target.value })} />{r.isNew && <small className="muted"> new</small>}</td>
                <td><input type="checkbox" checked={r.requiresComment} aria-label={`Require a comment for ${r.label}`} onChange={(e) => edit(r.code, { requiresComment: e.target.checked })} /></td>
                <td><input type="checkbox" checked={r.active} aria-label={`${r.label} active`} onChange={(e) => edit(r.code, { active: e.target.checked })} /> {r.active ? <Badge value="in" label="Shown" /> : <Badge value="inactive" label="Hidden" />}</td>
                <td className="num">{r.used ? `${r.used} return${r.used === 1 ? "" : "s"}` : "—"}</td>
                <td>{r.used ? <span className="muted">In use — disable instead</span> : <button type="button" className="table-action danger" onClick={() => remove(r.code)}>Delete</button>}</td>
              </tr>
            ))}
          </TableBody>
        </table>
      </div>
      <div className="ops-filters" style={{ marginTop: 14 }}>
        <input value={newLabel} maxLength={80} placeholder="New reason, e.g. Arrived late" aria-label="New reason" onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <label><input type="checkbox" checked={newNeedsComment} onChange={(e) => setNewNeedsComment(e.target.checked)} /> Require a comment</label>
        <button type="button" className="secondary-button" disabled={newLabel.trim().length < 2 || dupe(newLabel)} onClick={add}>Add reason</button>
        {newLabel && dupe(newLabel) && <span className="muted">That reason already exists.</span>}
      </div>
      {confirm && <ConfirmDialog title="Save return reasons?" confirmLabel="Save reasons" onClose={() => setConfirm(false)} onConfirm={save}
        message={<>Customers will choose from <b>{list.filter((r) => r.active).length}</b> active reason(s). Existing return requests keep the reason name they were submitted with.</>} />}
    </section>
  );
}

/* One page per sidebar entry; App.jsx maps the sidebar names to these view ids. */
const VIEW_COPY = {
  requests: ["Return Requests", "Every return request from customers. Open one to see its items, photos, refund and audit trail."],
  decide: ["Approve or Reject Returns", "New requests waiting for a decision. Approving makes a refund due after inspection; rejecting needs a reason the customer sees."],
  refunds: ["Refund Status", "Returns with a refund due, processing at Razorpay, completed or failed."],
  reasons: ["Return Reasons", "Add, rename, reorder or disable the reasons customers can give for a return."],
  items: ["Returned Products", "Each returned item — where it is, its condition after inspection and what went back into stock."],
};

export default function ReturnsPage({ view = "requests" }) {
  const [openId, setOpenId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const summary = useAdminData(`/admin/returns/summary?r=${refreshKey}`, { debounce: 0 });
  const reasons = useAdminData(`/admin/returns/reasons?r=${refreshKey}`, { debounce: 0 });
  const s = summary.data;
  const n = (v) => (s ? Number(v || 0).toLocaleString("en-IN") : "");
  const cards = [
    { label: "Total return requests", value: n(s?.total), note: s ? `${s.inProgress} in progress` : "" },
    { label: "Pending requests", value: n(s?.pending), tone: "amber", note: "awaiting review" },
    { label: "Approved returns", value: n(s?.approved), tone: "green" },
    { label: "Rejected returns", value: n(s?.rejected), tone: "red" },
    { label: "Products returned", value: n(s?.productsReturned), tone: "slate", note: s ? `${s.unitsRestocked} unit(s) restocked` : "" },
    { label: "Refunds pending", value: n(s?.refundsPending), tone: "amber", note: s?.refundsFailed ? `${s.refundsFailed} failed — retry` : "due or processing" },
    { label: "Refunds completed", value: n(s?.refundsCompleted), tone: "green", note: s ? money(s.refundedAmount) : "" },
  ];
  const changed = () => setRefreshKey((k) => k + 1);
  const common = { onOpen: setOpenId, refreshKey, reasons: reasons.data || [] };
  const [title, description] = VIEW_COPY[view] || VIEW_COPY.requests;
  return (
    <>
      <PageHeading eyebrow="RETURNS & REFUNDS" title={title} description={description} />
      <ErrorBanner error={summary.error} onRetry={summary.reload} />
      <StatCards items={cards} loading={!s && summary.loading} />
      {view === "requests" && <ReturnsTable key="req" title="All return requests" {...common} />}
      {view === "decide" && <ReturnsTable key="decide" status="requested" title="Waiting for a decision" description="Open a request and choose Approve or Reject." {...common} />}
      {view === "refunds" && <ReturnsTable key="ref" view="refunds" title="Refund status" {...common} />}
      {view === "reasons" && <ReasonsManager reasons={reasons.data} loading={!reasons.data && reasons.loading} error={reasons.error} onReload={reasons.reload} onSaved={changed} />}
      {view === "items" && <ReturnedItemsTable {...common} />}
      {openId && <ReturnDetail id={openId} onClose={() => setOpenId(null)} onChanged={changed} />}
    </>
  );
}
