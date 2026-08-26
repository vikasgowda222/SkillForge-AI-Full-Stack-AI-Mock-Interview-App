# SkillForge AI — AI Mock Interview Platform

SkillForge AI is a full-stack web app that runs realistic, AI-driven mock
interviews. A candidate describes a role and experience level, the app
generates tailored questions with a large language model, records spoken
answers, and returns structured, per-answer feedback and scoring.

Built with **Next.js 14 (App Router)**, **Clerk** auth, **Neon Postgres +
Drizzle ORM**, and **Google Gemini**. Written in JavaScript, type-guarded with
JSDoc and validated end-to-end with **Zod**.

---

## Architecture

All database access and all AI calls happen **on the server**, behind
authentication and per-row ownership checks. The browser never sees the
database connection string or the Gemini key, and never talks to either
service directly.

```
Browser (Client Components)
   │  calls Server Actions only  ──────────────┐
   ▼                                            ▼
Server Actions ("use server", server-only)   Server Components
   │   • Clerk auth() → userId                   • auth() + ownership fetch
   │   • Zod validation (input AND AI output)
   ├──────────────┬───────────────┐
   ▼              ▼               ▼
Drizzle/Neon   Gemini (JSON)   Rate limiter
(Postgres)     stateless        (per-user)
```

- **Server Actions** (`lib/actions/interviews.js`) are the only path to the
  database and the model. Every action resolves the Clerk `userId` and scopes
  every query to it (`where userId = :caller`), so one user can never read or
  mutate another user's interviews.
- **AI calls are stateless** (`lib/ai/gemini.js`): a fresh request per call
  with `responseMimeType: application/json`, so concurrent users never share
  chat context. Model output is parsed defensively and then **validated with
  Zod** before it is trusted or stored.
- **Server Components** fetch data with the same auth + ownership guard and
  render small Client Components for the interactive bits (webcam, speech,
  collapsibles).

## Features

- **AI-generated interviews** tailored to job role, description, and years of
  experience.
- **Adaptive follow-up questions** — an agentic step generates a deeper
  follow-up from the candidate's actual answer, so the interview reacts to what
  they say instead of following a fixed script.
- **Voice answers** via the browser Web Speech API, with webcam preview.
- **Multi-dimensional rubric scoring** — every answer is scored 0–10 on
  _correctness, clarity, depth,_ and _communication_ (not just one number),
  generated and Zod-validated server-side and shown as a per-skill breakdown.
- **Personal dashboard** with interview history and aggregate stats
  (best / average score + per-skill averages), computed NaN-safely.
- **Secure by construction** — auth-gated Server Actions, per-user ownership,
  Zod-validated inputs and model output, security headers + CSP, per-user rate
  limiting.

## Tech stack

| Area       | Choice                                              |
| ---------- | --------------------------------------------------- |
| Framework  | Next.js 14 (App Router), React 18                   |
| Auth       | Clerk (`@clerk/nextjs`)                             |
| Database   | Neon serverless Postgres + Drizzle ORM              |
| AI         | Google Gemini (`@google/generative-ai`)             |
| Validation | Zod (+ JSDoc types)                                 |
| UI         | Tailwind CSS + shadcn/ui, lucide-react, sonner      |
| Testing    | Vitest (unit + integration), Playwright (E2E smoke) |
| Tooling    | ESLint (next/core-web-vitals), Prettier             |

---

## Getting started

### Prerequisites

- Node.js 18.18+ (or 20+)
- A Neon Postgres database
- A Clerk application (publishable + secret keys)
- A Google Gemini API key

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in real values:

```bash
cp .env.example .env.local
```

> **Security:** `DATABASE_URL` and `GEMINI_API_KEY` are **server-only**. Never
> prefix them with `NEXT_PUBLIC_` — that would ship the secret in the browser
> bundle. See [`.env.example`](.env.example) for the full list.

### 3. Set up the database

Generate/apply the schema to your Neon database:

```bash
npm run db:push        # push the schema directly (fastest for a fresh DB)
# or, migration-based:
npm run db:generate    # regenerate SQL from utils/schema.js
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Script                 | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | Start the dev server                        |
| `npm run build`        | Production build                            |
| `npm run start`        | Serve the production build                  |
| `npm run lint`         | ESLint (`next/core-web-vitals`)             |
| `npm run format`       | Format with Prettier                        |
| `npm run format:check` | Verify formatting (used in CI)              |
| `npm run test`         | Run unit + integration tests (Vitest)       |
| `npm run test:watch`   | Vitest in watch mode                        |
| `npm run test:e2e`     | Playwright E2E smoke tests (needs real env) |
| `npm run db:generate`  | Generate Drizzle migration from the schema  |
| `npm run db:push`      | Push the schema to the database             |
| `npm run db:studio`    | Open Drizzle Studio                         |

## Testing

- **Unit** (`test/unit`): Zod validators, AI-output normalization, and the `cn`
  class helper — pure logic, no I/O.
- **Integration** (`test/integration`): Server Actions with the database,
  Gemini, Clerk, and rate limiter mocked. These lock in the security
  guarantees — unauthenticated calls throw, and every query is scoped to the
  caller's `userId`.
- **E2E** (`e2e`): Playwright smoke test (landing renders, `/dashboard` is
  auth-gated). Requires real Clerk keys and a running app, so it is **not** run
  in CI.

```bash
npm run test
```

## Project structure

```
app/                     App Router routes, layouts, error/loading boundaries
  dashboard/             Authenticated area (interviews, feedback)
components/
  layout/                Header / Footer
  ui/                    shadcn/ui primitives
lib/
  actions/interviews.js  Server Actions — the ONLY db/AI entry point
  ai/gemini.js           Stateless Gemini JSON client (server-only)
  validation/interview.js Zod schemas for input AND model output
  ratelimit.js           Per-user rate limiting (server-only)
utils/
  db.js                  Drizzle/Neon client (server-only)
  schema.js              Drizzle schema
drizzle/                 Generated SQL migrations + snapshots
test/                    Vitest unit + integration tests
e2e/                     Playwright smoke tests
```

## Deployment

Deploy to Vercel (or any Node host). Set the environment variables from
`.env.example` in the platform's project settings — **server-side**, not as
`NEXT_PUBLIC_`. Run the database migration/push against your production Neon
database before first use.

## Security notes

- Secrets are server-only and never exposed to the client.
- Security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS) are set in
  [`next.config.mjs`](next.config.mjs).
- All data access is authenticated and ownership-scoped.

## Roadmap

Advanced, trend-aligned features are landing as independent, layered PRs.
**Shipped:** multi-dimensional rubric scoring and agentic adaptive follow-up
questions. **Next up:** token-by-token streaming (Vercel AI SDK), resume/JD-aware
question generation, a per-skill analytics dashboard with shareable reports, a
coding-interview mode, and production infrastructure (Sentry, Upstash, Clerk
webhooks, Docker).

## License

[MIT](LICENSE) © Vikas Gowda
