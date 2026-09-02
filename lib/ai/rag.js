import "server-only";
import { db } from "@/utils/db";
import { ResumeChunk } from "@/utils/schema";
import { eq, sql } from "drizzle-orm";
import { getChatModel } from "@/lib/ai/gemini";

/**
 * Resume RAG (Retrieval-Augmented Generation).
 *
 * Pipeline:
 *   parseResumePdf() -> chunk() -> GoogleGenerativeAIEmbeddings -> ResumeChunk
 *                                                                                (vector(768))
 *
 *   searchResumeContext(query) -> embed query -> cosine similarity top-K
 *
 * Why this exists: the prompt for `createInterviewFromResume` previously
 * stuffed the whole 20k-char resume into a single prompt. That dilutes signal,
 * blows the window on long resumes, and costs more. RAG lets us pass only the
 * 6 chunks most relevant to the target role — better questions, lower spend.
 *
 * Storage: pgvector via Drizzle's `vector(N)` custom type. The column is added
 * by drizzle/0003_resume_rag.sql; if you skip the migration, this module
 * throws on first use.
 */

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;
const EMBEDDING_MODEL = "text-embedding-004";

/**
 * Split text into overlapping character chunks. Cheap, deterministic, and good
 * enough for resume prose — paragraph- or sentence-aware splitters are
 * overkill here.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function chunkText(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const chunks = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return chunks;
}

/**
 * Embed a single string via Gemini. Returns a 768-dim vector (Gemini
 * text-embedding-004 default). Calls a tiny LangChain wrapper around the
 * Google embedding endpoint so LangSmith traces these calls alongside the
 * chat-model calls.
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embedOne(text) {
  const { GoogleGenerativeAIEmbeddings } = await import(
    "@langchain/google-genai"
  );
  const emb = new GoogleGenerativeAIEmbeddings({
    model: EMBEDDING_MODEL,
    apiKey: process.env.GEMINI_API_KEY,
  });
  const v = await emb.embedQuery(text);
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error("Embedding returned empty vector.");
  }
  return v;
}

/**
 * Embed and store every chunk of a parsed resume, scoped to one user. Old
 * chunks for the same user + source are deleted first so re-uploads replace
 * cleanly.
 *
 * @param {{ userId: string, resumeText: string, mockIdRef?: string }} args
 * @returns {Promise<{ chunks: number }>}
 */
export async function indexResume({ userId, resumeText, mockIdRef }) {
  const chunks = chunkText(resumeText);
  if (chunks.length === 0) return { chunks: 0 };

  // Wipe previous chunks for this user (single-resume-at-a-time model).
  await db.delete(ResumeChunk).where(eq(ResumeChunk.userId, userId));

  const vectors = [];
  for (const c of chunks) vectors.push(await embedOne(c));

  const rows = chunks.map((text, i) => ({
    userId,
    mockIdRef: mockIdRef ?? null,
    source: "resume",
    chunkIndex: i,
    text,
    embedding: vectors[i],
  }));

  await db.insert(ResumeChunk).values(rows);
  return { chunks: chunks.length };
}

/**
 * Semantic search across a user's stored resume chunks.
 *
 * @param {{ query: string, userId?: string, topK?: number }} args
 * @returns {Promise<Array<{ id: number, text: string, score: number }>>}
 */
export async function searchResumeContext({
  query,
  userId,
  topK = 6,
}) {
  const cleaned = (query ?? "").trim();
  if (!cleaned) return [];

  const queryVec = await embedOne(cleaned);
  const vecLiteral = JSON.stringify(queryVec);
  const k = Math.max(1, Math.min(20, topK | 0));

  // Cosine distance via pgvector's <=> operator. The Drizzle custom `vector`
  // type casts the JSON array to vector(N) at the driver layer.
  const rows = await db.execute(sql`
    SELECT id, text,
           1 - (embedding <=> ${vecLiteral}::vector) AS score
    FROM resume_chunk
    WHERE user_id = ${userId ?? ""}
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT ${k}
  `);

  // Neon serverless returns an object with `.rows`.
  const result = rows?.rows ?? rows ?? [];
  return result.map((r) => ({
    id: Number(r.id),
    text: String(r.text),
    score: Number(r.score),
  }));
}

// Re-export for callers that want to use the same model instance.
export { getChatModel };