import { dateTime, money, titleCase } from "../utils/format";

const titles = {
  order: {
    placed: "Order placed", confirmed: "Order confirmed", packed: "Order processing",
    shipped: "Order shipped", out_for_delivery: "Out for delivery", delivered: "Order delivered",
    cancelled: "Order cancelled", returned: "Order returned",
  },
  return: { requested: "Return requested", in_transit: "Return picked up" },
  refund: { pending: "Refund pending", processed: "Refund issued", failed: "Refund failed" },
};

export default function OrderActivity({ items = [], onOpen }) {
  if (!items.length) return <p className="muted">No order activity in the last 30 days.</p>;
  return <ul className="order-activity-list">
    {items.map((item) => (
      <li key={item.id}>
        <button type="button" className="stock-notifications-item" onClick={() => onOpen(item.source === "return" ? "Return Requests" : "Manage Orders", item.returnNumber || item.orderNumber)}>
          <span className={`order-activity-dot activity-${item.source}`} aria-hidden="true" />
          <span className="stock-notifications-product">
            <strong>{titles[item.source]?.[item.status] || `${titleCase(item.source)} ${titleCase(item.status)}`}</strong>
            <span>{[item.orderNumber, item.returnNumber, item.customer, item.amount != null ? money(item.amount) : null].filter(Boolean).join(" · ")}</span>
            <time dateTime={item.at}>{dateTime(item.at)}</time>
          </span>
        </button>
      </li>
    ))}
  </ul>;
}
