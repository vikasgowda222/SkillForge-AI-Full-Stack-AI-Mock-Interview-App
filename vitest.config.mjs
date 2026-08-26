import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.mjs"],
    globals: false,
  },
  resolve: {
    alias: [
      // Neutralize the "server-only" import guard so Server Actions can be
      // imported into the (node) test environment.
      {
        find: "server-only",
        replacement: path.resolve(root, "test/stubs/server-only.js"),
      },
      // Match ONLY the "@/..." path alias — never scoped npm packages
      // like "@clerk/nextjs" or "@google/generative-ai".
      { find: /^@\//, replacement: `${root}/` },
    ],
  },
});
