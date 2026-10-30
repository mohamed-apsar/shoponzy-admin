import { useEffect, useState } from "react";
import { adminRequest } from "../api/adminApi";
import { money } from "../utils/format";
import { OrdersTable } from "./OrdersPage";

/* eslint-disable react/prop-types */
const DAY_OPTIONS = [7, 30, 90, 365];
const changeText = (pct) => (pct === null || pct === undefined ? "New" : `${pct >= 0 ? "+" : ""}${pct}%`);

function StatCard({ title, value, change, icon, tone }) {
  return (
    <section className="stat-card">
      <div className={`stat-icon ${tone}`}>{icon}</div>
      <p className="muted">{title}</p>
      <h2>{value}</h2>
      <span className={tone === "blue" ? "stat-note" : "stat-change"}>{change}</span>
    </section>
  );
}

export default function DashboardHome({ setPage }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    adminRequest(`/admin/dashboard?days=${days}`)
      .then((result) => { if (active) setData(result.data); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [days]);

  const totals = data?.totals;
  // Show at most 14 bars so long ranges stay readable (later points are summed into buckets).
  const trend = data?.salesTrend || [];
  const bucket = Math.max(1, Math.ceil(trend.length / 14));
  const bars = [];
  for (let i = 0; i < trend.length; i += bucket) {
    const slice = trend.slice(i, i + bucket);
    bars.push({ label: slice[slice.length - 1].date, revenue: slice.reduce((s, t) => s + t.revenue, 0), orders: slice.reduce((s, t) => s + t.orders, 0) });
  }
  const peak = Math.max(1, ...bars.map((b) => b.revenue));
  const dayLabel = (date) => new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", bucket === 1 && days <= 7 ? { weekday: "short" } : { day: "2-digit", month: "short" });

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>Dashboard</h1>
          <p className="muted">Here&apos;s what&apos;s happening with your store.</p>
        </div>
        <select className="date-chip" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
          {DAY_OPTIONS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>

      {error && <div className="products-form-error" role="alert">{error}</div>}

      <div className="stats-grid">
        <StatCard title="Total Revenue" value={totals ? money(totals.sales.value) : "…"} change={totals ? changeText(totals.sales.changePct) : ""} icon="₹" tone="green" />
        <StatCard title="Total Orders" value={totals ? totals.orders.value : "…"} change={totals ? changeText(totals.orders.changePct) : ""} icon="▣" tone="purple" />
        <StatCard title="Customers" value={totals ? totals.customers.value : "…"} change={totals ? `${totals.customers.newInRange} new` : ""} icon="♙" tone="orange" />
        <StatCard title="Products" value={totals ? totals.products : "…"} change={data ? `${data.pendingOrders} orders to process` : ""} icon="□" tone="blue" />
      </div>

      <div className="dashboard-grid">
        <section className="panel sales-panel">
          <div className="panel-heading">
            <div>
              <h2>Sales overview</h2>
              <p className="muted">Revenue for the last {days} days</p>
            </div>
            <span className="small-pill">{totals ? `Avg. order ${money(totals.averageOrderValue)}` : ""}</span>
          </div>
          <div className="chart">
            {bars.map((bar) => (
              <div className="chart-column" key={bar.label} title={`${money(bar.revenue)} · ${bar.orders} orders`}>
                <div className="bar-track">
                  <div className="bar" style={{ height: `${Math.round((bar.revenue / peak) * 100)}%` }} />
                </div>
                <span>{dayLabel(bar.label)}</span>
              </div>
            ))}
          </div>
          <p className="chart-note">Counts placed orders, excluding cancelled, returned and unpaid online orders.</p>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Inventory alerts</h2>
              <p className="muted">Products that need attention</p>
            </div>
          </div>
          <div className="alert-row">
            <span className="alert-icon orange-bg">!</span>
            <div className="alert-copy">
              <strong>Low stock</strong>
              <p>{data ? `${data.inventory.lowStock.length} products have ${data.inventory.lowStockThreshold} or fewer units in a variant.` : "…"}</p>
            </div>
          </div>
          <div className="alert-row">
            <span className="alert-icon red-bg">×</span>
            <div className="alert-copy">
              <strong>Out of stock</strong>
              <p>{data ? `${data.inventory.outOfStock} products need restocking.` : "…"}</p>
            </div>
          </div>
          {data?.needsAttention > 0 && (
            <div className="alert-row">
              <span className="alert-icon red-bg">!</span>
              <div className="alert-copy"><strong>Orders need attention</strong><p>{data.needsAttention} orders need a refund or manual review.</p></div>
            </div>
          )}
          <button className="text-button" onClick={() => setPage("Manage Products")}>
            Manage inventory →
          </button>
        </section>
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent orders</h2>
            <p className="muted">A quick look at your latest orders</p>
          </div>
          <button className="text-button" onClick={() => setPage("Manage Orders")}>
            View all orders →
          </button>
        </div>
        <OrdersTable items={(data?.recentOrders || []).map((o) => ({ ...o, contact: { name: o.customer } }))} />
      </section>
    </>
  );
}
