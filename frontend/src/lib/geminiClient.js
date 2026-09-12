import { GoogleGenAI } from "@google/genai";
import { functionDeclarations, executeTool } from "../tools/orderTools";

const DEFAULT_TOKEN_ENDPOINT = "http://localhost:8787/api/token";

const BURGER_SYSTEM_INSTRUCTION =
  "You are a voice order assistant for a burger restaurant. The menu has: burgers, fries, drinks, and salads. " +
  "You MUST call the provided tools (add_item, remove_item, change_quantity, get_order_summary, confirm_order) for every order change, summary request, or confirmation. " +
  "Never just claim or state that you changed or confirmed an order without calling the matching tool. " +
  "Never say you cannot confirm an order — call confirm_order whenever the customer wants to confirm. " +
  "Keep every spoken response short, ideally one sentence. " +
  "If the user trails off with filler words like 'um' or 'uh' or pauses mid-thought, wait patiently and do not respond until they've clearly finished. " +
  "If the user says something like 'wait, no, the other one' or 'actually, make that the other item', use the last items discussed to figure out which item they mean, and call the matching tool. " +
  "Treat short acknowledgements like 'mhm', 'yeah', or 'okay' as feedback, not as a new request needing a full response. " +
  "When the customer indicates they're done (e.g. 'that's all', 'that's it', 'I'm done'), ask if they would like to confirm the order, and call confirm_order when they say yes.";

/**
 * connectLiveSession
 *
 * Requests an ephemeral auth token from the backend and establishes
 * a real-time WebSocket connection to the Gemini Live API with burger ordering tools.
 *
 * @param {Object} options
 * @param {Function} options.onMessage - Called for every LiveServerMessage from Gemini
 * @param {Function} [options.onOpen] - Called when WebSocket connection opens
 * @param {Function} [options.onError] - Called when a WebSocket error occurs
 * @param {Function} [options.onClose] - Called when the WebSocket session closes
 * @returns {Promise<Object>} session object with sendRealtimeInput, sendToolResponse, and close methods
 */
export async function connectLiveSession({ onMessage, onOpen, onError, onClose }) {
  const tokenEndpoint = import.meta.env.VITE_TOKEN_ENDPOINT || DEFAULT_TOKEN_ENDPOINT;

  // 1. Fetch ephemeral token from backend
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to obtain token from ${tokenEndpoint} (${response.status} ${response.statusText}): ${
        errorBody.error || errorBody.message || "Unknown error"
      }`
    );
  }

  const token = await response.json();
  if (!token?.name) {
    throw new Error("Token endpoint did not return a valid 'name' property.");
  }

  // 2. Create client with ephemeral token in v1alpha
  const ai = new GoogleGenAI({
    apiKey: token.name,
    httpOptions: { apiVersion: "v1alpha" },
  });

  let sessionInstance = null;

  // 3. Connect to Gemini Live session with order tools
  const session = await ai.live.connect({
    model: "gemini-3.1-flash-live-preview",
    config: {
      responseModalities: ["AUDIO"],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: BURGER_SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations }],
    },
    callbacks: {
      onopen: onOpen,
      onmessage: async (message) => {
        // Interruption detection hook
        if (message.serverContent?.interrupted === true) {
          console.warn("[geminiClient] serverContent.interrupted === true received from Gemini");
        }

        // Module 6: Handle Gemini tool calls (function calling)
        if (message.toolCall?.functionCalls) {
          console.log("[Tool Call]", message.toolCall.functionCalls);
          const functionResponses = [];

          for (const fc of message.toolCall.functionCalls) {
            console.log("[Tool Call] Function name:", fc.name);
            console.log("[Tool Call] Arguments:", fc.args);
            const result = executeTool(fc.name, fc.args);
            console.log("[Tool Call] Execution result:", result);
            functionResponses.push({
              id: fc.id,
              name: fc.name,
              response: { result },
            });
          }

          if (functionResponses.length > 0) {
            console.log("[Tool Response Sent]", functionResponses);
            if (sessionInstance) {
              sessionInstance.sendToolResponse({ functionResponses });
            } else {
              console.error("[geminiClient] Cannot send tool response: sessionInstance is not set yet");
            }
          }
        }

        // Pass message forward to App.jsx for transcript, audio playback, and turn state
        if (typeof onMessage === "function") {
          onMessage(message);
        }
      },
      onerror: onError,
      onclose: onClose,
    },
  });

  sessionInstance = session;
  return session;
}
