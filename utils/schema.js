import {
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    mockIdIdx: uniqueIndex("mock_interview_mock_id_idx").on(table.mockId),
    userIdIdx: index("mock_interview_user_id_idx").on(table.userId),
    createdByIdx: index("mock_interview_created_by_idx").on(table.createdBy),
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
