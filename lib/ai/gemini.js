import "server-only";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

/** Lazily-constructed client so a missing key fails at call time, not import time. */
let client;
function getClient() {
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. This must be a server-only secret (never NEXT_PUBLIC_).",
    );
  }
  if (!client) client = new GoogleGenerativeAI(apiKey);
  return client;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

/** Strip ```json fences the model sometimes emits despite JSON mime type. */
function stripCodeFences(text) {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Generate a JSON response from Gemini.
 *
 * Stateless: a fresh request per call (no shared chat session), so concurrent
 * users never bleed context into each other. Forces JSON output and retries
 * once on a parse failure. The caller is expected to validate the shape with
 * Zod — this only guarantees valid JSON, not a valid schema.
 *
 * @param {string} prompt
 * @param {{ temperature?: number, maxOutputTokens?: number, retries?: number, model?: string }} [opts]
 * @returns {Promise<unknown>} parsed JSON value
 */
export async function generateJson(prompt, opts = {}) {
  const {
    temperature = 0.7,
    maxOutputTokens = 4096,
    retries = 1,
    model = DEFAULT_MODEL,
  } = opts;

  const generativeModel = getClient().getGenerativeModel({
    model,
    safetySettings,
  });
  const generationConfig = {
    temperature,
    topP: 0.95,
    topK: 40,
    maxOutputTokens,
    responseMimeType: "application/json",
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await generativeModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      });
      const text = result.response.text();
      return JSON.parse(stripCodeFences(text));
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Gemini generateJson failed after ${retries + 1} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
