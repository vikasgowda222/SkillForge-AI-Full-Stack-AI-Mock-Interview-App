import { pgTable, serial, text, varchar } from "drizzle-orm/pg-core";

export const MockInterview = pgTable("mock_interview", {
  id: serial("id").primaryKey(),
  jsonMockResp: text("json_mock_resp").notNull(),
  jobPosition: varchar("job_position").notNull(),
  jobDesc: varchar("job_desc").notNull(),
  jobExperience: varchar("job_experience").notNull(),
  createdBy: varchar("created_by").notNull(),
  createdAt: varchar("created_at"),
  mockId: varchar("mock_id").notNull(),

  question: text("question"),
  answer: text("answer"),
});

export const UserAnswer = pgTable("user_answer", {
  id: serial("id").primaryKey(),
  mockIdRef: varchar("mock_id_ref").notNull(),
  question: varchar("question").notNull(),
  correctAns: text("correct_ans"),
  userAns: text("user_ans"),
  feedback: text("feedback"),
  rating: varchar("rating"),
  userEmail: varchar("user_email"),
  createdAt: varchar("created_at"),
});
