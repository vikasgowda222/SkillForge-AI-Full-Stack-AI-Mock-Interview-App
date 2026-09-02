import {
  customType,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * pgvector `vector(N)` column. Stored as a text representation of the JSON
 * array `[0.1, 0.2, ...]` and cast server-side. Only the RAG module reads this.
 */
const vector = (dim) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dim})`;
    },
    toDriver(value) {
      return JSON.stringify(value);
    },
    fromDriver(value) {
      if (typeof value === "string") return JSON.parse(value);
      return value;
    },
  });

/**
 * A generated mock interview (a set of AI questions/answers) owned by one user.
 * `userId` is the Clerk user id and is the source of truth for ownership;
 * `createdBy` keeps the email for display only.
 */
export const MockInterview = pgTable(
  "mock_interview",
  {
    id: serial("id").primaryKey(),
    mockId: varchar("mock_id", { length: 36 }).notNull(),
    jsonMockResp: text("json_mock_resp").notNull(),
    jobPosition: varchar("job_position", { length: 255 }).notNull(),
    jobDesc: text("job_desc").notNull(),
    jobExperience: varchar("job_experience", { length: 20 }).notNull(),
    createdBy: varchar("created_by", { length: 320 }),
    userId: varchar("user_id", { length: 64 }).notNull(),
    // Opaque token for a public, read-only shared report. Null = not shared.
    // Set/cleared by the owner; the public share route looks up ONLY by this.
    shareId: varchar("share_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    mockIdIdx: uniqueIndex("mock_interview_mock_id_idx").on(table.mockId),
    userIdIdx: index("mock_interview_user_id_idx").on(table.userId),
    createdByIdx: index("mock_interview_created_by_idx").on(table.createdBy),
    shareIdIdx: uniqueIndex("mock_interview_share_id_idx").on(table.shareId),
  }),
);

/**
 * A single answer a user gave to one question of a mock interview, with the
 * AI feedback and rating. Owned via `userId`; `mockIdRef` links to
 * MockInterview.mockId.
 */
export const UserAnswer = pgTable(
  "user_answer",
  {
    id: serial("id").primaryKey(),
    mockIdRef: varchar("mock_id_ref", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    question: text("question").notNull(),
    correctAns: text("correct_ans"),
    userAns: text("user_ans"),
    feedback: text("feedback"),
    rating: integer("rating"),
    // Per-dimension rubric scores (0-10), nullable so pre-rubric rows and any
    // legacy data keep working. `rating` remains the overall score.
    scoreCorrectness: integer("score_correctness"),
    scoreClarity: integer("score_clarity"),
    scoreDepth: integer("score_depth"),
    scoreCommunication: integer("score_communication"),
    userEmail: varchar("user_email", { length: 320 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    mockIdRefIdx: index("user_answer_mock_id_ref_idx").on(table.mockIdRef),
    userIdIdx: index("user_answer_user_id_idx").on(table.userId),
    userEmailIdx: index("user_answer_user_email_idx").on(table.userEmail),
  }),
);

/**
 * One chunk of a parsed resume, embedded for semantic search (RAG). Owned via
 * `userId`; queries should always be scoped to the caller's userId.
 *
 * Embedding dim is hardcoded to 768 (Gemini text-embedding-004 default). If
 * you swap the embedding model, run a new migration to change the column type.
 */
export const ResumeChunk = pgTable(
  "resume_chunk",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id", { length: 64 }).notNull(),
    /** Optional link to the interview this resume was used to generate. */
    mockIdRef: varchar("mock_id_ref", { length: 36 }),
    source: varchar("source", { length: 32 }).notNull().default("resume"),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    embedding: vector(768)("embedding").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("resume_chunk_user_id_idx").on(table.userId),
    mockIdIdx: index("resume_chunk_mock_id_idx").on(table.mockIdRef),
  }),
);
