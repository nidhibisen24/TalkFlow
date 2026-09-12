import React, { useState, useRef, useEffect } from "react";
import "./styles.css";
import ConversationView from "./components/ConversationView";
import OrderSummary from "./components/OrderSummary";
import LatencyBadge from "./components/LatencyBadge";
import { startMicCapture } from "./lib/audioCapture";
import { connectLiveSession } from "./lib/geminiClient";

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

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export default function App() {
  // Real session turn state: "idle" | "listening" | "ai_speaking" | "interrupted"
  const [turnState, setTurnState] = useState("idle");
  const [orderItems] = useState(INITIAL_ORDER_ITEMS);
  const [lastLatencyMs] = useState(180);
  const [isConfirmed] = useState(false);
  const [transcript, setTranscript] = useState(INITIAL_TRANSCRIPT);
  const [isConnecting, setIsConnecting] = useState(false);

  const sessionRef = useRef(null);
  const stopMicRef = useRef(null);

  const endSession = () => {
    if (stopMicRef.current) {
      stopMicRef.current();
      stopMicRef.current = null;
    }
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (err) {
        console.warn("Error closing session:", err);
      }
      sessionRef.current = null;
    }
    setTurnState("idle");
    setIsConnecting(false);
  };

  useEffect(() => {
    return () => {
      endSession();
    };
  }, []);

  const handleStartSession = async () => {
    // If already running or connecting, end session
    if (sessionRef.current || isConnecting) {
      endSession();
      return;
    }

    try {
      setIsConnecting(true);

      // 1. Establish Gemini Live WebSocket session using ephemeral token
      const session = await connectLiveSession({
        onOpen: () => {
          console.log("[Gemini Live] Session WebSocket connected.");
          setTurnState("listening");
          setIsConnecting(false);
        },
        onMessage: (message) => {
          console.log("[Gemini Live Message]:", message);

          // Check and log real-time transcription
          if (message.serverContent?.inputTranscription?.text) {
            const userText = message.serverContent.inputTranscription.text;
            console.log("Input transcription:", userText);
            setTranscript((prev) => [...prev, { role: "user", text: userText }]);
          }

          if (message.serverContent?.outputTranscription?.text) {
            const aiText = message.serverContent.outputTranscription.text;
            console.log("Output transcription:", aiText);
            setTranscript((prev) => [...prev, { role: "assistant", text: aiText }]);
          }

          // Visual state cues based on server events
          if (message.serverContent?.modelTurn?.parts?.some((p) => p.inlineData)) {
            setTurnState("ai_speaking");
          }

          if (message.serverContent?.interrupted) {
            console.log("[Gemini Live] Interruption signal received from server");
            setTurnState("interrupted");
          }

          if (message.serverContent?.turnComplete) {
            setTurnState("listening");
          }
        },
        onError: (err) => {
          console.error("[Gemini Live Error]:", err);
          endSession();
        },
        onClose: (event) => {
          console.log("[Gemini Live Closed]:", event);
          endSession();
        },
      });

      sessionRef.current = session;

      // 2. Start microphone capture and stream base64 PCM16 chunks
      const stop = await startMicCapture((arrayBuffer) => {
        if (sessionRef.current) {
          const base64Chunk = arrayBufferToBase64(arrayBuffer);
          sessionRef.current.sendRealtimeInput({
            audio: {
              data: base64Chunk,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        }
      });

      stopMicRef.current = stop;
      setTurnState("listening");
    } catch (err) {
      console.error("Failed to start Gemini Live session:", err);
      alert(`Could not start session: ${err.message}\nMake sure backend is running and backend/.env contains a valid GEMINI_API_KEY.`);
      endSession();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleResetSession = () => {
    endSession();
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
            {isConnecting
              ? "⏳ Connecting..."
              : turnState !== "idle"
              ? "⏹ End Session"
              : "▶ Start Session"}
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
