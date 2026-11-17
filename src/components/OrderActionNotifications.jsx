import { useEffect, useState } from "react";
import { adminRequest } from "../api/adminApi";
import { ErrorBanner, PageHeading, StatCards, useAdminData } from "./ops/OpsKit";
import { dateTime } from "../utils/format";

/* eslint-disable react/prop-types */
export default function OrderActionNotifications({ onNavigate }) {
  const { data, error, loading, reload } = useAdminData("/admin/order-alerts", { debounce: 0 });
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") reload(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("admin:data-changed", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("admin:data-changed", refresh);
    };
  }, [reload]);
  async function review(id) {
    setBusy(id);
    setFailure("");
    try {
      await adminRequest(`/admin/orders/${id}/review-cancellation`, { method: "PATCH" });
      window.dispatchEvent(new Event("admin:data-changed"));
    } catch (e) { setFailure(e.message); }
    finally { setBusy(null); }
  }
  return <div className="ops-stack">
    <PageHeading eyebrow="NOTIFICATIONS" title="Order & Return Alerts" description="Customer cancellations and return requests awaiting action. Refreshes automatically every 30 seconds." actions={<button type="button" className="secondary-button" onClick={reload}>Refresh</button>} />
    <ErrorBanner error={error || failure} onRetry={reload} />
    <StatCards loading={!data && loading} items={[
      { label: "Cancellations awaiting review", value: data?.cancelledCount ?? "", tone: "amber" },
      { label: "Return requests awaiting review", value: data?.returnCount ?? "", tone: "red" },
    ]} />
    {data && <>
      <section className="panel"><div className="ops-toolbar"><h2>Cancelled orders</h2></div>
        {!data.cancellations.length && <p className="muted">No cancellations awaiting review.</p>}
        {data.cancellations.map((item) => <div className="ops-toolbar" key={item.id}>
          <div><strong>{item.orderNumber} · {item.customer}</strong><p className="muted">{item.message} · {dateTime(item.at)}</p></div>
          <div className="row"><button type="button" className="primary-button" onClick={() => onNavigate("Manage Orders", item.orderNumber)}>View order</button><button type="button" className="secondary-button" disabled={busy === item.id} onClick={() => review(item.id)}>{busy === item.id ? "Saving…" : "Mark reviewed"}</button></div>
        </div>)}
        {data.cancelledCount > data.cancellations.length && <p className="muted">Showing the latest {data.cancellations.length} cancellations. More appear after review.</p>}
      </section>
      <section className="panel"><div className="ops-toolbar"><h2>Return requests</h2><button type="button" className="secondary-button" onClick={() => onNavigate("Return Requests")}>View all returns</button></div>
        {!data.returns.length && <p className="muted">No return requests awaiting review.</p>}
        {data.returns.map((item) => <div className="ops-toolbar" key={item.id}><div><strong>{item.returnNumber} · {item.orderNumber}</strong><p className="muted">{item.customer} · {item.message} · {dateTime(item.at)}</p></div><button type="button" className="primary-button" onClick={() => onNavigate("Return Requests")}>Review return</button></div>)}
      </section>
    </>}
  </div>;
}
