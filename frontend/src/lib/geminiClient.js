import { GoogleGenAI } from "@google/genai";
import { functionDeclarations, executeTool } from "../tools/orderTools";

const DEFAULT_TOKEN_ENDPOINT = "http://localhost:8787/api/token";

const BURGER_SYSTEM_INSTRUCTION =
  "You are a friendly, fast voice order assistant for a burger restaurant. " +
  "Here is our complete restaurant menu:\n" +
  "- Burgers: Classic Burger, Cheese Burger, Chicken Burger\n" +
  "- Fries: Regular Fries, Large Fries\n" +
  "- Drinks: Coke, Sprite, Chocolate Milkshake\n" +
  "- Salads: Garden Salad, Caesar Salad\n\n" +
  "CONVERSATIONAL INSTRUCTIONS:\n" +
  "1. You CAN and SHOULD answer questions about the menu (e.g. 'What burgers do you have?', 'What drinks do you have?', 'What is on the menu?', 'Do you have cheese burgers?'). Answer accurately from our menu above and keep your answer short (1-2 sentences).\n" +
  "2. ORDER ACTIONS REQUIRE TOOLS: Whenever the customer wants to add, remove, or modify items in their order, you MUST call the matching tool (add_item, remove_item, change_quantity, get_order_summary, confirm_order). Never state that you added, removed, or changed an item without calling the tool.\n" +
  "3. ORDER CONFIRMATION: When the customer wants to check the order or confirm, call get_order_summary or confirm_order. Never say you cannot confirm an order — call confirm_order when they say yes or ask to confirm.\n" +
  "4. Keep every spoken response short, ideally one or two concise sentences.\n" +
  "5. If the user trails off with filler words like 'um' or 'uh' or pauses mid-thought, wait patiently and do not respond until they've clearly finished.\n" +
  "6. If the user says something like 'wait, no, the other one' or 'actually, make that the other item', use the last items discussed to figure out which item they mean, and call the matching tool.\n" +
  "7. Treat short acknowledgements like 'mhm', 'yeah', or 'okay' as feedback, not as a new request needing a full response.\n" +
  "8. When the customer indicates they are done, ask if they would like to confirm the order, and call confirm_order when they say yes.";

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
      // Module 7: Natural turn-taking tuning
      // LOW start-of-speech sensitivity plus a short prefix padding reduces
      // (but does not perfectly eliminate) false barge-in triggers from short sounds like "mhm";
      // an 800ms silence duration gives room for a mid-sentence thinking pause ("I'd like the, um...")
      // before the turn is considered finished, without making normal turn-taking feel sluggish.
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
          prefixPaddingMs: 20,
          silenceDurationMs: 800,
        },
      },
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
