"use server";
import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/utils/db";
import { MockInterview, UserAnswer } from "@/utils/schema";
import { generateJson } from "@/lib/ai/gemini";
import {
  aiFeedbackSchema,
  aiQuestionsSchema,
  createInterviewInput,
  normalizeQuestions,
  saveAnswerInput,
} from "@/lib/validation/interview";
import {
  assertAnswerRateLimit,
  assertInterviewRateLimit,
} from "@/lib/ratelimit";

/** Resolve the current Clerk user id or throw. Ownership is always keyed on this. */
async function requireUserId() {
  const { userId } = await auth();
  if (!userId) throw new Error("UNAUTHENTICATED");
  return userId;
}

async function currentEmail() {
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? null;
}

/**
 * Generate a new mock interview for the signed-in user.
 * @param {{ jobPosition: string, jobDescription: string, jobExperience: number|string }} rawInput
 * @returns {Promise<{ mockId: string }>}
 */
export async function createInterview(rawInput) {
  const userId = await requireUserId();
  const input = createInterviewInput.parse(rawInput);
  await assertInterviewRateLimit(userId);

  const prompt = [
    "You are a senior technical interviewer.",
    "Create exactly 5 interview questions with strong, concise model answers based on:",
    `- Job position: ${input.jobPosition}`,
    `- Tech stack / job description: ${input.jobDescription}`,
    `- Years of experience: ${input.jobExperience}`,
    'Return ONLY JSON: an array of 5 objects, each with string fields "question" and "answer". No markdown, no commentary.',
  ].join("\n");

  const raw = await generateJson(prompt, { temperature: 0.8 });
  const questions = aiQuestionsSchema.parse(normalizeQuestions(raw));

  const mockId = uuidv4();
  await db.insert(MockInterview).values({
    mockId,
    jsonMockResp: JSON.stringify(questions),
    jobPosition: input.jobPosition,
    jobDesc: input.jobDescription,
    jobExperience: String(input.jobExperience),
    createdBy: await currentEmail(),
    userId,
  });

  revalidatePath("/dashboard");
  return { mockId };
}

/** All interviews owned by the current user, newest first. */
export async function getMyInterviews() {
  const userId = await requireUserId();
  return db
    .select()
    .from(MockInterview)
    .where(eq(MockInterview.userId, userId))
    .orderBy(desc(MockInterview.createdAt));
}

/**
 * One interview by mockId, but only if the current user owns it.
 * @param {string} mockId
 * @returns {Promise<typeof MockInterview.$inferSelect | null>}
 */
export async function getInterviewById(mockId) {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(MockInterview)
    .where(
      and(eq(MockInterview.mockId, mockId), eq(MockInterview.userId, userId)),
    );
  return rows[0] ?? null;
}

/**
 * Delete an interview (and its answers) the current user owns.
 * @param {string} mockId
 */
export async function deleteInterview(mockId) {
  const userId = await requireUserId();
  const owned = await getInterviewById(mockId);
  if (!owned) throw new Error("NOT_FOUND");

  await db
    .delete(UserAnswer)
    .where(
      and(eq(UserAnswer.mockIdRef, mockId), eq(UserAnswer.userId, userId)),
    );
  await db
    .delete(MockInterview)
    .where(
      and(eq(MockInterview.mockId, mockId), eq(MockInterview.userId, userId)),
    );

  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Score and store a candidate's answer. Verifies interview ownership before
 * calling the model or writing anything.
 * @param {{ mockId: string, question: string, correctAns?: string|null, userAnswer: string }} rawInput
 * @returns {Promise<{ rating: number, feedback: string }>}
 */
export async function saveUserAnswer(rawInput) {
  const userId = await requireUserId();
  const input = saveAnswerInput.parse(rawInput);

  const interview = await getInterviewById(input.mockId);
  if (!interview) throw new Error("NOT_FOUND");
  await assertAnswerRateLimit(userId);

  const prompt = [
    "You are an interview coach. Evaluate the candidate's answer.",
    `Question: ${input.question}`,
    `Candidate answer: ${input.userAnswer}`,
    'Return ONLY JSON: {"rating": <integer 0-10>, "feedback": "<3-5 sentences of specific, constructive feedback>"}. No markdown.',
  ].join("\n");

  const raw = await generateJson(prompt, { temperature: 0.4 });
  const fb = aiFeedbackSchema.parse(raw);

  await db.insert(UserAnswer).values({
    mockIdRef: input.mockId,
    userId,
    question: input.question,
    correctAns: input.correctAns ?? null,
    userAns: input.userAnswer,
    feedback: fb.feedback,
    rating: fb.rating,
    userEmail: await currentEmail(),
  });

  revalidatePath(`/dashboard/interview/${input.mockId}/feedback`);
  return { rating: fb.rating, feedback: fb.feedback };
}

/**
 * Feedback for one interview the current user owns.
 * @param {string} mockId
 */
export async function getFeedback(mockId) {
  const userId = await requireUserId();
  const interview = await getInterviewById(mockId);
  if (!interview) return { interview: null, answers: [] };

  const answers = await db
    .select()
    .from(UserAnswer)
    .where(and(eq(UserAnswer.mockIdRef, mockId), eq(UserAnswer.userId, userId)))
    .orderBy(UserAnswer.id);

  return { interview, answers };
}

/** Aggregate dashboard stats for the current user (NaN-safe). */
export async function getDashboardStats() {
  const userId = await requireUserId();

  const [interviews, answers] = await Promise.all([
    db.select().from(MockInterview).where(eq(MockInterview.userId, userId)),
    db
      .select()
      .from(UserAnswer)
      .where(eq(UserAnswer.userId, userId))
      .orderBy(UserAnswer.createdAt),
  ]);

  const ratings = answers
    .map((a) => a.rating)
    .filter((r) => typeof r === "number" && !Number.isNaN(r));

  const bestScore = ratings.length ? Math.max(...ratings) : null;
  const averageScore = ratings.length
    ? Number((ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1))
    : null;
  const improvementPoints =
    ratings.length >= 2 ? ratings[ratings.length - 1] - ratings[0] : 0;

  return {
    totalInterviews: interviews.length,
    totalAnswers: answers.length,
    bestScore,
    averageScore,
    improvementPoints,
  };
}
