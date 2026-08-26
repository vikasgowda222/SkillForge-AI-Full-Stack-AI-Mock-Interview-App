/** @type { import("drizzle-kit").Config } */
import * as dotenv from "dotenv";

// Load env for CLI usage (drizzle-kit push/studio). In the app itself the
// platform injects env vars; this file is only used by the CLI.
dotenv.config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set (expected in .env.local for drizzle-kit).",
  );
}

export default {
  schema: "./utils/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
};
