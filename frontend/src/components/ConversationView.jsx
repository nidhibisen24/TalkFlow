import React, { useRef, useEffect } from "react";

const STATE_CONFIG = {
  idle: {
    label: "Idle",
    hint: "Ready to start session",
    className: "state-idle",
  },
  listening: {
    label: "Listening",
    hint: "Microphone active — speak anytime",
    className: "state-listening",
  },
  ai_speaking: {
    label: "AI Speaking",
    hint: "Audio streaming — speak to interrupt",
    className: "state-ai_speaking",
  },
  interrupted: {
    label: "Interrupted",
    hint: "Barge-in detected! Halting output",
    className: "state-interrupted",
  },
};

export default function ConversationView({ turnState = "idle", transcript = [] }) {
  const currentState = STATE_CONFIG[turnState] || STATE_CONFIG.idle;
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div className="panel-card conversation-panel">
      {/* Top Header with TurnState Badge */}
      <div className="conversation-header">
        <h2 className="panel-title">
          <span>💬</span> Conversation
        </h2>

        <div
          className={`state-badge ${currentState.className}`}
          id="turn-state-badge"
          title={currentState.hint}
        >
          <span className="status-dot"></span>
          <span className="state-name">{currentState.label}</span>
        </div>
      </div>

      {/* Scrollable Transcript List */}
      <div className="transcript-list" id="transcript-container" ref={containerRef}>
        {transcript.map((line, index) => (
          <div
            key={index}
            className={`transcript-message ${line.role === "user" ? "user" : "assistant"}`}
          >
            <span className="message-role">
              {line.role === "user" ? "You (Customer)" : "BurgerFlow Assistant"}
            </span>
            <div className="message-bubble">{line.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
