/**
 * Embed a resume from disk into the RAG store.
 *
 * Usage:
 *   node scripts/embed-resume.js path/to/resume.txt [userId]
 *
 * The text file should contain the plain-text contents of the resume. Reads
 * the resume, chunks it, embeds via Gemini (text-embedding-004), and writes
 * rows into the `resume_chunk` table.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const fs = await import("node:fs/promises");
const path = await import("node:path");

const { indexResume } = await import("../lib/ai/rag.js");

async function main() {
  const [, , filePath, userIdArg] = process.argv;
  if (!filePath) {
    console.error("Usage: node scripts/embed-resume.js <path-to-resume.txt> [userId]");
    process.exit(2);
  }
  const abs = path.resolve(filePath);
  const text = await fs.readFile(abs, "utf8");
  const userId = userIdArg ?? `cli-${Date.now()}`;
  const { chunks } = await indexResume({ userId, resumeText: text });
  console.log(`Indexed ${chunks} chunks for userId=${userId}`);
}

main().catch((err) => {
  console.error("embed failed:", err);
  process.exit(1);
});