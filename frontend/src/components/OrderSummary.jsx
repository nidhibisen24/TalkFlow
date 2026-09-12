import React from "react";

export default function OrderSummary({ orderItems = [], isConfirmed = false }) {
  return (
    <div className="panel-card order-summary-panel">
      <div className="order-summary-header">
        <h2 className="panel-title">
          <span>🛒</span> Live Order Summary
        </h2>
        <span className="order-item-count">{orderItems.length} items</span>
      </div>

      <ul className="order-items-list" id="order-items-list">
        {orderItems.length === 0 ? (
          <li className="order-item" style={{ color: "var(--text-muted)" }}>
            No items added yet
          </li>
        ) : (
          orderItems.map((item, idx) => (
            <li key={item.id || idx} className="order-item">
              <span className="order-item-desc">{item.name}</span>
              <span className="order-item-count">x {item.quantity}</span>
            </li>
          ))
        )}
      </ul>

      <div className="order-status-row">
        <span className="order-status-label">Order Confirmation:</span>
        <span className={`confirmed-tag ${isConfirmed ? "yes" : "no"}`} id="order-confirmed-status">
          Confirmed: {isConfirmed ? "yes" : "no"}
        </span>
      </div>
    </div>
  );
}
