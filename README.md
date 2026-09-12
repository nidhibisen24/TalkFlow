# Voice You Can Interrupt

A real-time voice ordering assistant with true barge-in interruption, built with React, Vite, Node.js, and the Gemini Live Multimodal API (`gemini-3.1-flash-live-preview`).

---

## 1. Project Title & Pitch

**Voice You Can Interrupt**  
A low-latency, conversational drive-thru voice assistant that you can naturally interrupt mid-sentence. Built on the Gemini Live API, it stops speaking instantly when you barge in, handles thinking pauses, processes in-flight order corrections, and updates a live order ticket using real function calling.

---

## 2. Problem Statement

> 5
A Voice You Can Interrupt
Speak to it in your browser. Hear it answer. Then cut it off mid-sentence, and have it actually stop.
Speak to it in your browser. Hear it answer. Then cut it off mid-sentence, and have it actually stop.

That last part is the whole project. Voice demos that only work when you wait politely for your turn are everywhere and are worth nothing. Real conversation is full of interruption. Getting it right means genuinely understanding what your own system is doing at the moment you talk over it, and nothing else on this list will punish a design you do not understand this immediately.

What must be true of it

Microphone in the browser, speech out of the speakers, something intelligent in between. Your choice of models, providers, or local anything.
Interruption works. You start speaking while it is talking. It stops. Not at the end of the sentence, not after the buffer drains. It stops, whatever it was in the middle of doing is abandoned, and what you just said is what it responds to. Nothing upstream keeps running and billing you for audio nobody will hear. Put a number on how fast it stops and say how you measured it.
It has something to do. Questions over a small document set, taking an order, booking something. A voice interface with nothing behind it cannot be judged and will not be.
A person who trails off mid-sentence must be neither cut off nor left hanging. "I'd like the, um..." is one situation and "...that's all" is another, and they sound identical for the first second. You will produce both failure modes while building this and so will we.

Your test set

A browser UI and a model behind it. Record 1-2 minutes of continuous conversation showing, at minimum: a clean exchange, a hard interruption partway through an answer, an interruption immediately followed by a new question it answers correctly, and one mid-sentence pause it correctly waits through.

Deliverable: public GitHub URL plus the video link.

Anyone can get it to stop. What we will remember is whether it feels like talking to something: whether it handles "wait, no, the other one," whether it knows an "mhm" is not an interruption. Chase that once the basics hold.

## 3. Features

- **Continuous Microphone Capture**: Streams browser audio downsampled to 16kHz 16-bit PCM via a dedicated `AudioWorklet` processor (`PCMDownsamplerProcessor`), running uninterrupted across conversational turns and barge-in events.
- **Real Barge-In Interruption**: Synchronous audio cutoff the millisecond Gemini's server-side VAD detects barge-in, instantly stopping active audio buffers, invalidating stale in-flight chunks with a monotonically increasing `turnId`, and rendering a 400ms visual interruption flash.
- **Order Taking via Function Calling**: Real menu ordering backed by Gemini function declarations (`add_item`, `remove_item`, `change_quantity`, `get_order_summary`, `confirm_order`), updating a local reactive order state with immediate UI reflection in `OrderSummary`.
- **Conversational Intelligence & Menu Knowledge**: Full awareness of demo restaurant menu items (burgers, fries, drinks, shakes, salads), capable of answering general menu questions without refusing or bypassing function calling.
- **Natural Turn-Taking Tuning**: Configured with `realtimeInputConfig` (`START_SENSITIVITY_LOW`, `END_SENSITIVITY_LOW`, `silenceDurationMs: 800`, `prefixPaddingMs: 20`) to tolerate thinking pauses without premature cutoff while rejecting transient noise.
- **Interruption Latency Measurement**: Live tracking of the perceived round-trip barge-in latency (from local RMS speech-onset detection to physical Web Audio cutoff), displaying instantaneous and session-average metrics in `LatencyBadge`.
- **Streamed Bubble Accumulation**: Incremental assistant transcription chunks smoothly assemble into a single coherent message bubble per conversational turn.

---

## 4. Architecture

The system uses a two-tier architecture designed for minimal latency and secure credential handling:

1. **Backend (Auth & Ephemeral Token Minting)**: A lightweight Node.js/Express server that holds the master `GEMINI_API_KEY` securely in `backend/.env`. It exposes `POST /api/token`, which calls `ai.authTokens.create()` from the `@google/genai` SDK to generate a single-use, short-lived ephemeral session token.
2. **Frontend (Direct Gemini Live Connection)**: A React + Vite single-page application. Upon starting a session, the browser fetches an ephemeral token from the backend, then establishes a direct bidirectional WebSocket connection to the Gemini Live API (`gemini-3.1-flash-live-preview`). Mic audio is streamed continuously upstream, while AI speech, transcription, and tool call invocations stream downstream directly to the client.

### Architecture Diagram

```
+-------------------------------------------------------------------------+
|                           BROWSER CLIENT (React)                        |
|                                                                         |
|  [Microphone] -> AudioWorklet (16kHz PCM16, 32ms chunks)                |
|  [Speaker]    <- AudioPlaybackQueue (24kHz Web Audio, hardStop cutoff)  |
|  [State]      <- OrderSummary, LatencyBadge, ConversationView           |
+-------------------+---------------------------------+-------------------+
                    |                                 ^
       1. POST /api/token                             |
          (Fetch ephemeral token)                     | 2. Direct Bidirectional WebSocket
                    v                                 |    (Audio, Tools, Transcripts)
+------------------------------------+                |
|       NODE / EXPRESS BACKEND       |                v
|       (http://localhost:8787)      |   +---------------------------------------+
|                                    |   |        GEMINI LIVE API (Cloud)        |
|  - Holds master GEMINI_API_KEY     |   |                                       |
|  - Calls ai.authTokens.create()    |   |  Model: gemini-3.1-flash-live-preview |
|  - Mints unconstrained token       |   |  Server-Side Acoustic VAD             |
+------------------------------------+   +---------------------------------------+
```

---

## 5. Setup Instructions

### Prerequisites
- Node.js (v18+ recommended, v20+ supported)
- npm
- A valid Google Gemini API Key with access to the Gemini Live API

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nidhibisen24/TalkFlow.git
   cd TalkFlow
   ```

2. **Configure and start the backend:**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   ```
   Open `backend/.env` in your editor and insert your Gemini API key:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   PORT=8787
   ```
   Start the backend server:
   ```bash
   node server.js
   ```
   Verify it logs: `Server listening on port 8787`.

3. **Install and start the frontend:**
   Open a **second terminal window** at the repo root:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open the printed localhost URL (default: `http://localhost:5173`) in Google Chrome or any modern Chromium browser.

---

## 6. Dependencies

### Backend (`backend/package.json`)
- `@google/genai` (^2.22.0): Official Google GenAI SDK used to mint ephemeral tokens via `ai.authTokens.create()`.
- `express` (^4.21.2): Minimal HTTP server hosting `GET /health` and `POST /api/token` endpoints.
- `cors` (^2.8.5): Enables Cross-Origin Resource Sharing for browser client requests.
- `dotenv` (^16.4.7): Loads environment variables from `backend/.env`.

### Frontend (`frontend/package.json`)
- `@google/genai` (^2.22.0): Official Google GenAI SDK establishing direct browser WebSocket connection with Gemini Live API (`ai.live.connect`).
- `react` (^19.2.8): Core UI framework for component rendering and state synchronization.
- `react-dom` (^19.2.8): DOM renderer for React components.
- `vite` (^8.3.0) [dev]: Build tool and local development server.

---

## 7. Environment Variables

All environment configuration is isolated to the backend:

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | *None* | Google Gemini API key used by backend to mint ephemeral tokens. |
| `PORT` | No | `8787` | Port for the Express backend server. |

> **CRITICAL SECURITY NOTE:** `GEMINI_API_KEY` must **never** be committed to source control or exposed in the frontend client. It lives exclusively in `backend/.env`, which is strictly included in `.gitignore`. The browser only ever receives short-lived, single-use ephemeral tokens.

---

## 8. How to Run

1. **Terminal 1 (Backend)**:
   ```bash
   cd backend
   node server.js
   ```
2. **Terminal 2 (Frontend)**:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:5173` in a Chromium browser (Chrome, Edge, Brave).
4. Grant microphone access when prompted.
5. Click **"▶ Start Session"** to begin voice ordering.

---

## 9. Interruption Mechanism

The barge-in engine functions through close coordination between Gemini's server-side VAD and the client's Web Audio playback queue:

1. **Continuous Uplink**: The browser mic capture pipeline runs continuously via `audioCapture.js` and `pcm-downsampler-worklet.js`. Audio is streamed to Gemini via `session.sendRealtimeInput` regardless of whether the assistant is currently speaking or silent.
2. **Server-Side VAD Classification**: With automatic activity detection enabled, Gemini's cloud audio stack continuously analyzes incoming audio. When the server detects user speech while generating an assistant response, it immediately cancels upstream generation (halting further token generation and audio synthesis).
3. **Interruption Signal**: The server pushes a `LiveServerMessage` containing `serverContent: { interrupted: true }` down the WebSocket.
4. **Synchronous Hard Stop (`audioPlayback.js`)**: The frontend checks `serverContent.interrupted === true` as the very first operation in its message handler. It immediately invokes `playbackQueue.hardStop()`:
   - Synchronously calls `.stop(0)` and `.disconnect()` on every active `AudioBufferSourceNode` scheduled in Web Audio.
   - Flushes the `activeSources` array to 0 length.
   - Increments `currentTurnId` (a monotonic turn counter).
5. **Stale Chunk Invalidation**: Any audio chunks already in network transit from the cancelled turn are discarded upon arrival because their tagged `turnId` no longer matches the newly incremented `currentTurnId`.
6. **Zero Pipeline Restarts**: The mic capture pipeline is never stopped or recreated; the user's interrupting utterance is already in Gemini's hands as the new active turn.

---

## 10. Latency Methodology

The latency metric displayed in the UI measures the **perceived, end-to-end round-trip barge-in cutoff time**:

- **$T_0$ (Speech Onset)**: In `audioCapture.js`, each outgoing 16-bit PCM chunk (~32ms) is evaluated using root-mean-square energy (`computeChunkRms`). When energy crosses the empirical threshold (`RMS >= 0.025`) while `turnState === "ai_speaking"`, `recordSpeechStart()` captures `performance.now()`. A boolean hysteresis flag ensures this triggers only on initial onset, not repeated frames.
- **$T_1$ (Audio Silencing)**: When `serverContent.interrupted === true` arrives at the client, `playbackQueue.hardStop()` executes, clears all `activeSources`, and immediately calls `recordAudioStop()` capturing `performance.now()`.
- **Latency Calculation**: $\text{Latency} = T_1 - T_0$.

> **Measurement Note:** This is an honest, real-world measurement of user-perceived responsiveness. It encompasses mic buffer accumulation (~16–32ms), client-to-server network transit (~30–100ms), server-side VAD inference (~100–250ms), server-to-client network transit (~30–100ms), and Web Audio disconnection (~1–5ms). It is not a lab-isolated server metric.

---

## 11. Test Results

| Test Name | Result | Notes |
|---|---|---|
| 1. Clean exchange | Pass | - |
| 2. Hard interruption | Pass |255 ms |
| 3. Interruption + new question | Pass| 292 ms|
| 4. Mid-sentence hesitation | Pass | - |
| 5. Correction ("make that...") | Pass | 355 ms |
| 6. Backchannel ("mhm") | Pass | - |

---

## 12. What Is Mocked

To keep the focus strictly on real-time voice interaction and barge-in mechanics, the surrounding business domain is explicitly mocked:
- **In-Memory Order State**: The restaurant "database" is a local in-memory JavaScript object in `orderTools.js`. Orders reset when the session ends or resets.
- **No Payment or Checkout**: There is no payment gateway, credit card processing, or point-of-sale terminal integration.
- **Static Menu**: The menu catalog is defined within the client system prompt and tool definitions rather than an external database or CMS.
- **No User Authentication**: There are no customer accounts, login flows, or user identity management.
- **Local Deployment**: The project is architected and tested as a local pair of dev servers (`localhost:8787` backend and `localhost:5173` frontend).

---

## 13. Limitations

- **Acoustic vs. Semantic VAD**: Gemini's Live VAD relies on acoustic sound detection. While sensitivity tuning (`START_SENSITIVITY_LOW`, `prefixPaddingMs: 20`) filters out many subtle sounds, loud or extended backchannel utterances (such as a forceful *"mhm"* or *"yeah"*) can still trigger an interruption because acoustic models cannot distinguish conversational intent from interjection without linguistic semantic processing.
- **Backend Coupling**: The frontend cannot connect to Gemini without the local Express backend running, as it requires an ephemeral token minted by the backend's server credentials.
- **Browser Compatibility**: Requires modern browser support for `AudioWorklet`, `AudioContext`, and WebSockets (tested on Chromium-based browsers; permissions must be granted).
- **Manual Verification**: Testing was performed manually against the structured regression plan; no automated browser audio mock test runner is currently integrated.

---

## 14. Demo Video

Demo video: <link>

---

## 15. Future Improvements

- **Persistent Order Database**: Backing `orderTools.js` with PostgreSQL or SQLite to persist ticket history and kitchen display system (KDS) integration.
- **Multi-Language Support**: Expanding system instructions and VAD configurations to support bilingual drive-thru ordering (e.g. English and Spanish).
- **Dynamic Inventory & POS APIs**: Integrating with real restaurant POS systems (e.g. Toast, Square) for real-time item availability, 86'd items, and pricing calculation.
- **Automated Audio Regression Suite**: Headless browser automation utilizing synthetic PCM audio injection to evaluate interruption latency and tool assertions in CI/CD.
- **Cloud Deployment**: Containerizing the backend for Google Cloud Run and serving the frontend bundle via CDN with secure WSS connections.
