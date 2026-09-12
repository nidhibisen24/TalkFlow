import React, { useState, useRef, useEffect } from "react";
import "./styles.css";
import ConversationView from "./components/ConversationView";
import OrderSummary from "./components/OrderSummary";
import LatencyBadge from "./components/LatencyBadge";
import { startMicCapture } from "./lib/audioCapture";
import { connectLiveSession } from "./lib/geminiClient";
import { createPlaybackQueue } from "./lib/audioPlayback";
import { recordInterruptStop } from "./lib/latency";
import { resetOrder } from "./tools/orderTools";

const INITIAL_TRANSCRIPT = [
  {
    role: "assistant",
    text: "Welcome to BurgerFlow! I can take your order for burgers, fries, drinks, and salads. What can I get started for you?",
  },
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
  const [lastLatencyMs] = useState(180);
  const [transcript, setTranscript] = useState(INITIAL_TRANSCRIPT);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInterruptedFlash, setIsInterruptedFlash] = useState(false);

  const sessionRef = useRef(null);
  const stopMicRef = useRef(null);
  const playbackQueueRef = useRef(null);
  const isAiTurnActiveRef = useRef(false);
  const flashTimeoutRef = useRef(null);

  const endSession = () => {
    if (stopMicRef.current) {
      stopMicRef.current();
      stopMicRef.current = null;
    }
    if (playbackQueueRef.current) {
      playbackQueueRef.current.reset();
    }
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (err) {
        console.warn("Error closing session:", err);
      }
      sessionRef.current = null;
    }
    resetOrder();
    isAiTurnActiveRef.current = false;
    setIsInterruptedFlash(false);
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

      // Initialize or reset audio playback queue
      if (!playbackQueueRef.current) {
        playbackQueueRef.current = createPlaybackQueue();
      } else {
        playbackQueueRef.current.reset();
      }

      // 1. Establish Gemini Live WebSocket session using ephemeral token
      const session = await connectLiveSession({
        onOpen: () => {
          console.log("[Gemini Live] Session WebSocket connected.");
          setTurnState("listening");
          setIsConnecting(false);
        },
        onMessage: (message) => {
          console.log("[Gemini Live Message]:", message);

          // Task 3: Check for serverContent.interrupted as the VERY FIRST check
          if (message.serverContent?.interrupted === true) {
            const tAudioStop = performance.now();
            recordInterruptStop(tAudioStop);
            console.warn(
              `[Gemini Live] Interruption triggered by server at t=${tAudioStop.toFixed(2)}ms`
            );

            // 1. Synchronously hard-stop audio playback
            playbackQueueRef.current?.hardStop();
            isAiTurnActiveRef.current = false;

            // 2. Trigger brief 400ms visual flash
            setIsInterruptedFlash(true);
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => {
              setIsInterruptedFlash(false);
            }, 400);

            // 3. Immediately transition turnState to "interrupted", then back to "listening"
            setTurnState("interrupted");
            setTimeout(() => {
              setTurnState("listening");
            }, 250);

            // Do not process any other content from an interrupted message
            return;
          }

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

          // Enqueue raw audio data for speaker playback, tagged with turnId
          const parts = message.serverContent?.modelTurn?.parts;
          let hasAudioChunk = false;

          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                if (!isAiTurnActiveRef.current) {
                  isAiTurnActiveRef.current = true;
                  playbackQueueRef.current?.startNewTurn();
                }
                const turnId = playbackQueueRef.current?.currentTurnId;
                playbackQueueRef.current?.enqueueChunk(part.inlineData.data, turnId);
                hasAudioChunk = true;
              }
            }
          } else if (message.data) {
            if (!isAiTurnActiveRef.current) {
              isAiTurnActiveRef.current = true;
              playbackQueueRef.current?.startNewTurn();
            }
            const turnId = playbackQueueRef.current?.currentTurnId;
            playbackQueueRef.current?.enqueueChunk(message.data, turnId);
            hasAudioChunk = true;
          }

          if (hasAudioChunk) {
            setTurnState("ai_speaking");
          }

          if (message.serverContent?.turnComplete) {
            isAiTurnActiveRef.current = false;
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

      // 2. Start microphone capture and stream base64 PCM16 chunks continuously
      // (Mic runs uninterrupted across all AI turns and barge-ins)
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
      alert(
        `Could not start session: ${err.message}\nMake sure backend is running and backend/.env contains a valid GEMINI_API_KEY.`
      );
      endSession();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleResetSession = () => {
    endSession();
  };

  return (
    <div className={`app-container ${isInterruptedFlash ? "interrupted-flash" : ""}`}>
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
          <OrderSummary />
          <LatencyBadge lastLatencyMs={lastLatencyMs} />
        </section>
      </main>
    </div>
  );
}
