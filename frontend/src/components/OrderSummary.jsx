import React, { useState, useEffect } from "react";
import { subscribe } from "../tools/orderTools";

export default function OrderSummary() {
  const [order, setOrder] = useState({ items: [], confirmed: false });

  useEffect(() => {
    const unsubscribe = subscribe((state) => {
      setOrder(state);
    });
    return () => unsubscribe();
  }, []);

  const { items, confirmed } = order;

  return (
    <div className="panel-card order-summary-panel">
      <div className="order-summary-header">
        <h2 className="panel-title">
          <span>🍔</span> Live Order Summary
        </h2>
        <span className="order-item-count">{items.length} items</span>
      </div>

      <ul className="order-items-list" id="order-items-list">
        {items.length === 0 ? (
          <li
            className="order-item"
            style={{
              color: "var(--text-muted)",
              justifyContent: "center",
              fontStyle: "italic",
            }}
          >
            No items in order yet — speak to add
          </li>
        ) : (
          items.map((item, idx) => (
            <li key={item.id || idx} className="order-item">
              <span className="order-item-desc">{item.name}</span>
              <span className="order-item-count">x {item.quantity}</span>
            </li>
          ))
        )}
      </ul>

      <div className="order-status-row">
        <span className="order-status-label">Order Confirmation:</span>
        <span
          className={`confirmed-tag ${confirmed ? "yes" : "no"}`}
          id="order-confirmed-status"
        >
          Confirmed: {confirmed ? "yes" : "no"}
        </span>
      </div>
    </div>
  );
}
