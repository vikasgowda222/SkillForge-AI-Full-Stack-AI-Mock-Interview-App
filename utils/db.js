import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. This must be a server-only secret (never prefixed with NEXT_PUBLIC_).",
  );
}

const sql = neon(connectionString);

/**
 * Drizzle client bound to the Neon serverless driver.
 * `import "server-only"` guarantees this module can never be bundled into
 * client code, so the database credentials stay on the server.
 */
export const db = drizzle(sql, { schema });
