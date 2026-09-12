import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/token", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("POST /api/token failed: GEMINI_API_KEY is not set in backend/.env");
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in backend/.env",
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });

    const tokenCreator = ai.authTokens || ai.tokens;
    if (!tokenCreator || typeof tokenCreator.create !== "function") {
      throw new Error("Unable to locate authTokens.create on GoogleGenAI client instance");
    }

    const token = await tokenCreator.create({
      config: {
        uses: 1,
      },
    });

    return res.json({ name: token.name, expireTime: token.expireTime });
  } catch (err) {
    console.error("Error generating ephemeral token in POST /api/token:", err);
    return res.status(500).json({
      error: "Failed to generate ephemeral token",
      message: err.message || String(err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
