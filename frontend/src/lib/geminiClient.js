import { GoogleGenAI } from "@google/genai";

const DEFAULT_TOKEN_ENDPOINT = "http://localhost:8787/api/token";

/**
 * connectLiveSession
 *
 * Requests an ephemeral auth token from the backend and establishes
 * a real-time WebSocket connection to the Gemini Live API.
 *
 * @param {Object} options
 * @param {Function} options.onMessage - Called for every LiveServerMessage from Gemini
 * @param {Function} [options.onOpen] - Called when WebSocket connection opens
 * @param {Function} [options.onError] - Called when a WebSocket error occurs
 * @param {Function} [options.onClose] - Called when the WebSocket session closes
 * @returns {Promise<Object>} session object with sendRealtimeInput and close methods
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

  // 3. Connect to Gemini Live session
  const session = await ai.live.connect({
    model: "gemini-3.1-flash-live-preview",
    config: {
      responseModalities: ["AUDIO"],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: "You are a helpful voice assistant. For now just have a normal conversation.",
    },
    callbacks: {
      onopen: onOpen,
      onmessage: onMessage,
      onerror: onError,
      onclose: onClose,
    },
  });

  // 4. Return session object
  return session;
}
