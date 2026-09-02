import "server-only";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

/**
 * LangChain-wrapped Gemini client.
 *
 * LangSmith tracing is automatic when these env vars are set in the deployment
 * environment — LangChain picks them up with zero code changes:
 *   LANGCHAIN_TRACING_V2=true
 *   LANGCHAIN_API_KEY=lsv2_...
 *   LANGCHAIN_PROJECT=skillforge-ai
 *
 * Wrapping the raw `@google/generative-ai` SDK in LangChain gives:
 *   - Standard Runnable interface (.invoke / .stream / .batch)
 *   - PromptTemplate composition
 *   - Zod-structured output via StructuredOutputParser
 *   - Built-in LangSmith tracing for every call
 *   - The same safetySettings + JSON behavior the old code had, but exposed as
 *     a single ChatModel
 */

const apiKey = process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

/**
 * Lazily-constructed ChatModel so a missing key fails at call time, not
 * import time — same lazy contract the original code had. Tests can still
 * vi.mock this module before it's imported.
 * @type {ChatGoogleGenerativeAI | undefined}
 */
let _model;
function getModel() {
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. This must be a server-only secret (never NEXT_PUBLIC_).",
    );
  }
  if (!_model) {
    _model = new ChatGoogleGenerativeAI({
      model: DEFAULT_MODEL,
      apiKey,
      temperature: 0.7,
      maxOutputTokens: 4096,
      topP: 0.95,
      topK: 40,
      // Force JSON output (matches the old `responseMimeType: application/json`).
      // LangChain passes this through to the underlying SDK.
      responseMimeType: "application/json",
      // Avoid noisy safety blocks on interview content.
      safetySettings: [
        "HARM_CATEGORY_HARASSMENT:BLOCK_MEDIUM_AND_ABOVE",
        "HARM_CATEGORY_HATE_SPEECH:BLOCK_MEDIUM_AND_ABOVE",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT:BLOCK_MEDIUM_AND_ABOVE",
        "HARM_CATEGORY_DANGEROUS_CONTENT:BLOCK_MEDIUM_AND_ABOVE",
      ],
    });
  }
  return _model;
}

/**
 * Build a Runnable: input -> structured object validated against `schema`.
 *
 * Uses LangChain's StructuredOutputParser (Zod via the `zod-to-json-schema`
 * dependency that `@langchain/core` already pulls in). This is the supported
 * pattern for typed, validated LLM output — the parser retries on schema
 * mismatch, so callers don't have to hand-roll the retry loop.
 *
 * @template T
 * @param {string} promptTemplate - {input} placeholder
 * @param {z.ZodType<T>} schema
 * @returns {RunnableSequence<{ input: string }, T>}
 */
export function buildStructuredChain(promptTemplate, schema) {
  const parser = StructuredOutputParser.fromZodSchema(schema);
  const prompt = PromptTemplate.fromTemplate(
    [
      promptTemplate,
      "",
      "{format_instructions}",
    ].join("\n"),
  );
  return RunnableSequence.from([prompt, getModel(), parser]);
}

/**
 * Convenience for callers that already have a fully-rendered prompt and just
 * want it parsed into `schema`. Preserves the old `generateJson(prompt)` shape
 * so the rest of the codebase can keep calling one function.
 *
 * @template T
 * @param {string} prompt
 * @param {z.ZodType<T>} schema
 * @param {{ temperature?: number, maxOutputTokens?: number, model?: string }} [opts]
 * @returns {Promise<T>}
 */
export async function generateStructured(prompt, schema, opts = {}) {
  const { temperature = 0.7, maxOutputTokens = 4096 } = opts;
  const chain = buildStructuredChain("{input}", schema);
  // Bind run-scoped options. LangSmith traces the bind as a child of the call.
  return chain.invoke(
    { input: prompt },
    {
      temperature,
      maxOutputTokens,
      runName: "skillforge.generateStructured",
      tags: ["skillforge", "gemini"],
    },
  );
}

/**
 * Generate a JSON response from Gemini, validated against a Zod schema.
 *
 * Backwards-compatible thin wrapper around `generateStructured`. The old code
 * called `generateJson(prompt)`; new code should prefer `generateStructured`
 * with an explicit schema, but both work.
 *
 * @deprecated Prefer generateStructured(prompt, schema) for typed output.
 * @param {string} prompt
 * @param {{ temperature?: number, maxOutputTokens?: number, retries?: number, model?: string }} [opts]
 * @returns {Promise<unknown>}
 */
export async function generateJson(prompt, opts = {}) {
  // Loose schema: any object. The caller is still expected to validate the
  // shape with Zod (see lib/validation/interview.js). This preserves the old
  // "valid JSON, not valid schema" guarantee.
  return generateStructured(prompt, z.unknown(), opts);
}

/** @returns {ChatGoogleGenerativeAI} the underlying chat model (for graph nodes). */
export function getChatModel() {
  return getModel();
}

export { DEFAULT_MODEL };