// Bootstrap the pgvector extension on Neon. Neon supports vector out of the
// box; this just creates it if it isn't there. Idempotent.
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
await sql`CREATE EXTENSION IF NOT EXISTS vector`;
console.log("pgvector extension ready");
