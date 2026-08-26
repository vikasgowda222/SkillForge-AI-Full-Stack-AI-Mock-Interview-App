# Contributing to SkillForge AI

Thanks for your interest in improving SkillForge AI! This guide covers the
workflow and the conventions the project follows.

## Development setup

1. Fork and clone the repository.
2. Install dependencies: `npm install`.
3. Copy `.env.example` to `.env.local` and fill in your own Clerk, Neon, and
   Gemini credentials.
4. Push the schema to your database: `npm run db:push`.
5. Start the dev server: `npm run dev`.

## Branch & PR workflow

- Create a feature branch off `main` (e.g. `feat/streaming-feedback`,
  `fix/dashboard-stats`).
- Keep changes focused. Prefer several small, logically-scoped commits over one
  large mixed commit.
- Open a pull request against `main` and fill in the PR template. Nothing is
  merged without review.

## Before you open a PR

Run the full local check suite — CI runs the same steps:

```bash
npm run lint
npm run format:check
npm run test
npm run build
```

- `npm run format` will auto-fix formatting.
- The production build must succeed with placeholder env values (no secrets
  required to compile).

## Coding conventions

- **Language:** JavaScript, not TypeScript. Add types with **JSDoc** and
  validate all external data (user input **and** AI output) with **Zod**.
- **Security first:** database and AI access must stay on the server. Never
  import `@/utils/db`, `@/lib/ai/*`, or `@/lib/ratelimit` from a Client
  Component, and never expose secrets via `NEXT_PUBLIC_`.
- **Ownership:** every data-access path must resolve the Clerk `userId` and
  scope queries to it. Add a test that proves a second user cannot reach the
  first user's data.
- **Formatting:** Prettier (config in `.prettierrc.json`). Lint clean under
  `next/core-web-vitals`.
- Use React keys tied to stable ids, not array indices.

## Tests

- Add unit tests for new pure logic (validators, helpers, math).
- Add integration tests for new Server Actions, mocking the database, Gemini,
  and Clerk, and asserting the auth + ownership guards.
- Update or add a Playwright smoke test if you add a new top-level route.

## Reporting issues

Open a GitHub issue with reproduction steps, expected vs. actual behavior, and
environment details. For security-sensitive reports, please avoid filing a
public issue with exploit details.
