# SkillForge AI — AI Mock Interview Platform

SkillForge AI is a full-stack web app that runs realistic, AI-driven mock
interviews. A candidate describes a role, the app generates tailored questions
with a large language model, records spoken answers, and returns structured,
per-answer feedback and scoring.

Built with **Next.js 14 (App Router)**, **Clerk**, **Neon Postgres +
Drizzle ORM + pgvector**, and **Google Gemini** wrapped in **LangChain** with
**LangGraph** for the agentic follow-up loop. Written in JavaScript,
type-guarded with JSDoc and validated end-to-end with **Zod**. LLM calls are
traced with **LangSmith** when the relevant env vars are set.

---

## Architecture

All database access and all AI calls happen **on the server**, behind
authentication and per-row ownership checks. The browser never sees the
database connection string, the Gemini key, or the LangSmith key, and never
talks to any of those services directly.

```
Browser (Client Components)
   │  calls Server Actions only  ──────────────┐
   ▼                                            ▼
Server Actions ("use server", server-only)   Server Components
   │   • Clerk auth() → userId                   • auth() + ownership fetch
   │   • Zod validation (input AND AI output)
   ├──────────────┬───────────────┐
   ▼              ▼               ▼
Drizzle/Neon   Gemini via       Rate limiter
(Postgres +    LangChain /       (per-user)
pgvector)      LangGraph
```

- **Server Actions** (`lib/actions/interviews.js`) are the only path to the
  database and the model. Every action resolves the Clerk `userId` and scopes
  every query to it (`where userId = :caller`), so one user can never read or
  mutate another user's interviews.
- **AI calls go through LangChain** (`lib/ai/gemini.js`):
  `ChatGoogleGenerativeAI` with `StructuredOutputParser` (Zod) for typed,
  validated output. The same `Runnable` interface supports `.invoke`,
  `.stream`, and `.batch`, and is auto-instrumented for LangSmith tracing.
- **The follow-up loop is a LangGraph `StateGraph`**
  (`lib/ai/followup-graph.js`). The graph carries the full interview
  transcript as graph state (the "memory"), lets the model call tools
  (`lookup_github_profile`) before committing to a question, and is
  bounded by a step cap.
- **RAG over resumes** (`lib/ai/rag.js`): parsed resumes are chunked,
  embedded with Gemini `text-embedding-004`, and stored in Postgres with the
  `pgvector` extension. `createInterviewFromResume` retrieves only the
  top-K chunks most relevant to the target role before generating questions.
- **Server Components** fetch data with the same auth + ownership guard and
  render small Client Components for the interactive bits (webcam, speech,
  collapsibles).

## Features

- **AI-generated interviews** tailored to job role, description, and years of
  experience.
- **Adaptive follow-up questions** — a **LangGraph** agent that maintains the
  transcript as state, optionally calls tools, and emits a structured
  follow-up question. The interview reacts to what the candidate actually
  says instead of following a fixed script.
- **RAG-grounded interview generation** from the candidate's own resume PDF
  (chunked + embedded into pgvector, retrieved by semantic similarity).
- **GitHub-personalized interviews** that reference the candidate's real
  languages and top repos — the same `fetchGitHubProfile` is exposed as a
  tool the follow-up graph can call.
- **Tool / function calling** via LangChain `DynamicStructuredTool`
  (`lookup_github_profile`), so the LLM can request fresh context mid-loop.
- **Voice answers** via the browser Web Speech API, with webcam preview.
- **Multi-dimensional rubric scoring** — every answer is scored 0–10 on
  _correctness, clarity, depth,_ and _communication_ (not just one number),
  generated and Zod-validated server-side and shown as a per-skill breakdown.
- **Personal dashboard** with interview history, score timeline, per-skill
  averages, and rating distribution (NaN-safe).
- **LLM evaluation harness** (`npm run eval`) that runs fixed fixtures
  through the same Zod-validated rubric pipeline, and reports schema
  conformance, in-band accuracy, and stability across runs.
- **LangSmith tracing** — every LangChain call (chat, embeddings, graph
  nodes, tool calls) is traced automatically when
  `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_API_KEY=…`,
  `LANGCHAIN_PROJECT=skillforge-ai` are set. No code changes required.
- **Secure by construction** — auth-gated Server Actions, per-user ownership,
  Zod-validated inputs and model output, security headers + CSP, per-user
  rate limiting.

## Tech stack

| Area        | Choice                                                       |
| ----------- | ------------------------------------------------------------ |
| Framework   | Next.js 14 (App Router), React 18                            |
| Auth        | Clerk (`@clerk/nextjs`)                                      |
| Database    | Neon serverless Postgres + Drizzle ORM + pgvector            |
| AI runtime  | LangChain (`ChatGoogleGenerativeAI`, StructuredOutputParser) |
| Agent graph | LangGraph (`StateGraph`, tool calling, transcript state)     |
| Embeddings  | Google `text-embedding-004`                                  |
| Tracing     | LangSmith (env-driven, zero code)                            |
| Validation  | Zod (+ JSDoc types)                                          |
| UI          | Tailwind CSS + shadcn/ui, lucide-react, sonner               |
| Testing     | Vitest (unit + integration), Playwright (E2E smoke)          |
| Tooling     | ESLint (next/core-web-vitals), Prettier                      |

---

## Getting started

### Prerequisites

- Node.js 18.18+ (or 20+)
- A Neon Postgres database (with the `vector` extension available)
- A Clerk application (publishable + secret keys)
- A Google Gemini API key
- (Optional) A LangSmith API key for tracing

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in real values:

```bash
cp .env.example .env.local
```

> **Security:** `DATABASE_URL`, `GEMINI_API_KEY`, and `LANGCHAIN_API_KEY` are
> **server-only**. Never prefix them with `NEXT_PUBLIC_` — that would ship
> the secret in the browser bundle. See [`.env.example`](.env.example) for
> the full list.

### 3. Set up the database

Generate/apply the schema to your Neon database:

```bash
npm run db:push        # push the schema directly (fastest for a fresh DB)
# or, migration-based:
npm run db:generate    # regenerate SQL from utils/schema.js
```

The `pgvector` extension is enabled by migration `0003_resume_rag.sql`. On
Neon, the extension is already available; on plain Postgres you may need
`CREATE EXTENSION IF NOT EXISTS vector;` as a superuser first.

### 4. (Optional) Enable tracing

```bash
# .env.local
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=skillforge-ai
```

Restart the dev server. Every LangChain call now appears in your LangSmith
project, including the LangGraph follow-up agent's tool calls.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Scripts

| Script                 | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                                    |
| `npm run build`        | Production build                                                        |
| `npm run start`        | Serve the production build                                              |
| `npm run lint`         | ESLint (`next/core-web-vitals`)                                         |
| `npm run format`       | Format with Prettier                                                    |
| `npm run format:check` | Verify formatting (used in CI)                                          |
| `npm run test`         | Run unit + integration tests (Vitest)                                   |
| `npm run test:watch`   | Vitest in watch mode                                                    |
| `npm run test:e2e`     | Playwright E2E smoke tests (needs real env)                             |
| `npm run db:generate`  | Generate Drizzle migration from the schema                              |
| `npm run db:push`      | Push the schema to the database                                         |
| `npm run db:studio`    | Open Drizzle Studio                                                     |
| `npm run eval`         | Run the LLM evaluation harness (`scripts/eval.js`)                      |
| `npm run rag:embed`    | Embed a resume file into the pgvector store (`scripts/embed-resume.js`) |

## Testing

- **Unit** (`test/unit`): Zod validators, AI-output normalization, and the `cn`
  class helper — pure logic, no I/O.
- **Integration** (`test/integration`): Server Actions with the database,
  Gemini, Clerk, LangGraph, and rate limiter mocked. These lock in the
  security guarantees — unauthenticated calls throw, every query is scoped to
  the caller's `userId`, and the follow-up graph receives the full transcript
  as memory.
- **E2E** (`e2e`): Playwright smoke test (landing renders, `/dashboard` is
  auth-gated). Requires real Clerk keys and a running app, so it is **not** run
  in CI.
- **LLM eval** (`npm run eval`): scripts/eval.js — runs fixed fixtures
  through the same Zod-validated rubric pipeline the app uses, reports
  schema conformance, in-band accuracy, and stability.

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
  ai/gemini.js           LangChain ChatGoogleGenerativeAI + Zod structured output
  ai/followup-graph.js   LangGraph StateGraph for adaptive follow-ups
  ai/rag.js              Chunking + embeddings + pgvector retrieval
  parsing/pdf.js         Server-side PDF text extraction
  integrations/github.js Public GitHub profile fetch (also exposed as a tool)
  validation/interview.js Zod schemas for input AND model output
  ratelimit.js           Per-user rate limiting (server-only)
utils/
  db.js                  Drizzle/Neon client (server-only)
  schema.js              Drizzle schema (incl. pgvector ResumeChunk)
drizzle/                 Generated SQL migrations + snapshots
scripts/
  eval.js                LLM evaluation harness
  embed-resume.js        Bulk-embed a resume into pgvector
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
**Shipped:** multi-dimensional rubric scoring, LangGraph adaptive follow-up
with tool calling + transcript memory, RAG over resumes with pgvector,
LangSmith tracing, LLM eval harness. **Next up:** token-by-token streaming
(Vercel AI SDK), a per-skill analytics dashboard with shareable reports, a
coding-interview mode, and production infrastructure (Sentry, Upstash, Clerk
webhooks, Docker).

## License

[MIT](LICENSE) © Vikas Gowda
