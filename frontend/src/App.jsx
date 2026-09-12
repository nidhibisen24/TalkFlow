import React, { useState, useRef, useEffect } from "react";
import "./styles.css";
import ConversationView from "./components/ConversationView";
import OrderSummary from "./components/OrderSummary";
import LatencyBadge from "./components/LatencyBadge";

const INITIAL_TRANSCRIPT = [
  {
    role: "assistant",
    text: "Welcome to DriveThru Express! What can I prepare fresh for you today?",
  },
  {
    role: "user",
    text: "Hi! I'd like two iced caramel macchiatos...",
  },
  {
    role: "assistant",
    text: "Two iced caramel macchiatos! Would you prefer oat milk, almond, or whole—",
  },
  {
    role: "user",
    text: "Wait, actually make that oat milk! And could you also add a blueberry scone?",
  },
  {
    role: "assistant",
    text: "Got it! Switched both to oat milk and added one warm blueberry scone. Anything else?",
  },
];

const INITIAL_ORDER_ITEMS = [
  { id: 1, name: "Iced Caramel Macchiato (Oat Milk)", quantity: 2 },
  { id: 2, name: "Warm Blueberry Scone", quantity: 1 },
];

export default function App() {
  // Turn state can be: "idle" | "listening" | "ai_speaking" | "interrupted"
  const [turnState, setTurnState] = useState("idle");
  const [orderItems] = useState(INITIAL_ORDER_ITEMS);
  const [lastLatencyMs] = useState(180);
  const [isConfirmed] = useState(false);
  const [transcript] = useState(INITIAL_TRANSCRIPT);
  const [isSessionRunning, setIsSessionRunning] = useState(false);

  const timeoutIdsRef = useRef([]);

  const clearAllTimeouts = () => {
    timeoutIdsRef.current.forEach((id) => clearTimeout(id));
    timeoutIdsRef.current = [];
  };

  useEffect(() => {
    return () => clearAllTimeouts();
  }, []);

  const handleStartSession = () => {
    clearAllTimeouts();
    setIsSessionRunning(true);

    // Requirement: cycle turnState through idle -> listening -> ai_speaking -> interrupted -> listening
    // Step 1: Listening (immediately)
    setTurnState("listening");

    // Step 2: AI Speaking (after 2s)
    const t1 = setTimeout(() => {
      setTurnState("ai_speaking");
    }, 2000);

    // Step 3: Interrupted / Barge-in (after 4.5s)
    const t2 = setTimeout(() => {
      setTurnState("interrupted");
    }, 4500);

    // Step 4: Back to Listening (after 6.5s)
    const t3 = setTimeout(() => {
      setTurnState("listening");
      setIsSessionRunning(false);
    }, 6500);

    timeoutIdsRef.current = [t1, t2, t3];
  };

  const handleResetSession = () => {
    clearAllTimeouts();
    setIsSessionRunning(false);
    setTurnState("idle");
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">⚡</div>
          <div>
            <h1 className="brand-title">Voice You Can Interrupt</h1>
            <p className="brand-tagline">Real-Time Barge-In Voice Ordering Assistant</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            id="start-session-btn"
            className="btn-primary"
            onClick={handleStartSession}
          >
            {isSessionRunning ? "🔄 Cycling States..." : "▶ Start Session"}
          </button>
          {turnState !== "idle" && (
            <button
              id="reset-session-btn"
              onClick={handleResetSession}
              style={{
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                borderRadius: "var(--radius-pill)",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Reset
            </button>
          )}
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <main className="main-content">
        {/* Left Column: Conversation + Turn State Badge */}
        <section className="column-left">
          <ConversationView turnState={turnState} transcript={transcript} />
        </section>

        {/* Right Column: Order Summary + Latency Badge stacked */}
        <section className="column-right">
          <OrderSummary orderItems={orderItems} isConfirmed={isConfirmed} />
          <LatencyBadge lastLatencyMs={lastLatencyMs} />
        </section>
      </main>
    </div>
  );
}
