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
  aiFollowUpSchema,
  aiQuestionsSchema,
  aiRubricSchema,
  createInterviewInput,
  followUpInput,
  normalizeQuestions,
  overallFromRubric,
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
 * Score and store a candidate's answer against a multi-dimensional rubric.
 * Verifies interview ownership before calling the model or writing anything.
 * The overall `rating` is derived from the rubric so historical stats and the
 * feedback UI keep working unchanged.
 * @param {{ mockId: string, question: string, correctAns?: string|null, userAnswer: string }} rawInput
 * @returns {Promise<{ rating: number, feedback: string, rubric: { correctness: number, clarity: number, depth: number, communication: number } }>}
 */
export async function saveUserAnswer(rawInput) {
  const userId = await requireUserId();
  const input = saveAnswerInput.parse(rawInput);

  const interview = await getInterviewById(input.mockId);
  if (!interview) throw new Error("NOT_FOUND");
  await assertAnswerRateLimit(userId);

  const prompt = [
    "You are a senior interview evaluator. Score the candidate's answer on a",
    "detailed rubric. Be fair but rigorous.",
    `Question: ${input.question}`,
    `Candidate answer: ${input.userAnswer}`,
    "Score each dimension as an integer from 0 to 10:",
    "- correctness: factual / technical accuracy of the answer",
    "- clarity: how clearly the idea is communicated",
    "- depth: detail, concrete examples, and reasoning",
    "- communication: structure, conciseness, and delivery",
    'Return ONLY JSON: {"correctness":<0-10>,"clarity":<0-10>,"depth":<0-10>,',
    '"communication":<0-10>,"overallRating":<0-10>,"feedback":"<3-5 sentences',
    'of specific, constructive feedback>"}. No markdown, no commentary.',
  ].join("\n");

  const raw = await generateJson(prompt, { temperature: 0.4 });
  const rubric = aiRubricSchema.parse(raw);
  const overall = overallFromRubric(rubric);

  await db.insert(UserAnswer).values({
    mockIdRef: input.mockId,
    userId,
    question: input.question,
    correctAns: input.correctAns ?? null,
    userAns: input.userAnswer,
    feedback: rubric.feedback,
    rating: overall,
    scoreCorrectness: rubric.correctness,
    scoreClarity: rubric.clarity,
    scoreDepth: rubric.depth,
    scoreCommunication: rubric.communication,
    userEmail: await currentEmail(),
  });

  revalidatePath(`/dashboard/interview/${input.mockId}/feedback`);
  return {
    rating: overall,
    feedback: rubric.feedback,
    rubric: {
      correctness: rubric.correctness,
      clarity: rubric.clarity,
      depth: rubric.depth,
      communication: rubric.communication,
    },
  };
}

/**
 * Generate an adaptive follow-up question that probes deeper based on the
 * candidate's answer. This is the agentic step: the next question depends on
 * what the candidate actually said, not a fixed script. Auth + ownership +
 * rate limited. Ephemeral — the follow-up is returned for the client to ask;
 * its answer is persisted via saveUserAnswer like any other.
 * @param {{ mockId: string, question: string, userAnswer: string }} rawInput
 * @returns {Promise<{ question: string }>}
 */
export async function generateFollowUp(rawInput) {
  const userId = await requireUserId();
  const input = followUpInput.parse(rawInput);

  const interview = await getInterviewById(input.mockId);
  if (!interview) throw new Error("NOT_FOUND");
  await assertAnswerRateLimit(userId);

  const prompt = [
    "You are a senior technical interviewer conducting a live interview.",
    "Given the previous question and the candidate's answer, ask ONE focused",
    "follow-up question that probes deeper, tests an edge case, or clarifies a",
    "gap in their answer. Ask a single question only.",
    `Role context: ${interview.jobPosition}`,
    `Previous question: ${input.question}`,
    `Candidate answer: ${input.userAnswer}`,
    'Return ONLY JSON: {"question":"<the follow-up question>"}. No markdown.',
  ].join("\n");

  const raw = await generateJson(prompt, { temperature: 0.7 });
  const followUp = aiFollowUpSchema.parse(raw);
  return { question: followUp.question };
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

/**
 * Turn on public sharing for an interview the current user owns, minting an
 * opaque share token (reused if already shared). Recruiters can then open a
 * read-only report at /share/<token> with no login.
 * @param {string} mockId
 * @returns {Promise<{ shareId: string }>}
 */
export async function enableSharing(mockId) {
  const userId = await requireUserId();
  const interview = await getInterviewById(mockId);
  if (!interview) throw new Error("NOT_FOUND");

  const shareId = interview.shareId ?? uuidv4();
  if (!interview.shareId) {
    await db
      .update(MockInterview)
      .set({ shareId })
      .where(
        and(eq(MockInterview.mockId, mockId), eq(MockInterview.userId, userId)),
      );
  }
  revalidatePath(`/dashboard/interview/${mockId}/feedback`);
  return { shareId };
}

/**
 * Revoke public sharing for an interview the current user owns.
 * @param {string} mockId
 */
export async function disableSharing(mockId) {
  const userId = await requireUserId();
  const interview = await getInterviewById(mockId);
  if (!interview) throw new Error("NOT_FOUND");

  await db
    .update(MockInterview)
    .set({ shareId: null })
    .where(
      and(eq(MockInterview.mockId, mockId), eq(MockInterview.userId, userId)),
    );
  revalidatePath(`/dashboard/interview/${mockId}/feedback`);
  return { ok: true };
}

/**
 * PUBLIC (no auth): fetch a shared, read-only report by its opaque token.
 * Looks up strictly by `shareId`, so nothing is exposed unless the owner
 * explicitly enabled sharing. Personal identifiers (userId, email) are
 * stripped from the payload.
 * @param {string} token
 * @returns {Promise<{ jobPosition: string, jobExperience: string, createdAt: Date, answers: Array<object> } | null>}
 */
export async function getSharedReport(token) {
  if (!token || typeof token !== "string") return null;

  const rows = await db
    .select()
    .from(MockInterview)
    .where(eq(MockInterview.shareId, token));
  const interview = rows[0];
  if (!interview) return null;

  const answers = await db
    .select()
    .from(UserAnswer)
    .where(eq(UserAnswer.mockIdRef, interview.mockId))
    .orderBy(UserAnswer.id);

  return {
    jobPosition: interview.jobPosition,
    jobExperience: interview.jobExperience,
    createdAt: interview.createdAt,
    answers: answers.map((a) => ({
      id: a.id,
      question: a.question,
      rating: a.rating,
      feedback: a.feedback,
      scoreCorrectness: a.scoreCorrectness,
      scoreClarity: a.scoreClarity,
      scoreDepth: a.scoreDepth,
      scoreCommunication: a.scoreCommunication,
    })),
  };
}

/**
 * Analytics for the current user: a score timeline, per-skill averages, and a
 * rating distribution. All NaN-safe — unscored answers are ignored.
 * @returns {Promise<{ timeline: Array<{ index: number, rating: number }>, skillAverages: object, distribution: Array<{ band: string, count: number }>, totalScored: number }>}
 */
export async function getAnalytics() {
  const userId = await requireUserId();

  const answers = await db
    .select()
    .from(UserAnswer)
    .where(eq(UserAnswer.userId, userId))
    .orderBy(UserAnswer.createdAt);

  const scored = answers.filter(
    (a) => typeof a.rating === "number" && !Number.isNaN(a.rating),
  );

  const timeline = scored.map((a, i) => ({ index: i + 1, rating: a.rating }));

  const dimensionAverage = (column) => {
    const values = answers
      .map((a) => a[column])
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    return values.length
      ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(1))
      : null;
  };
  const skillAverages = {
    correctness: dimensionAverage("scoreCorrectness"),
    clarity: dimensionAverage("scoreClarity"),
    depth: dimensionAverage("scoreDepth"),
    communication: dimensionAverage("scoreCommunication"),
  };

  const bands = [
    { band: "0-2", min: 0, max: 2 },
    { band: "3-4", min: 3, max: 4 },
    { band: "5-6", min: 5, max: 6 },
    { band: "7-8", min: 7, max: 8 },
    { band: "9-10", min: 9, max: 10 },
  ];
  const distribution = bands.map(({ band, min, max }) => ({
    band,
    count: scored.filter((a) => a.rating >= min && a.rating <= max).length,
  }));

  return { timeline, skillAverages, distribution, totalScored: scored.length };
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

  // Per-dimension averages for the skill radar. NaN-safe: a dimension with no
  // scored answers (e.g. pre-rubric rows) is null rather than NaN.
  const dimensionAverage = (column) => {
    const values = answers
      .map((a) => a[column])
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    return values.length
      ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(1))
      : null;
  };

  const skillAverages = {
    correctness: dimensionAverage("scoreCorrectness"),
    clarity: dimensionAverage("scoreClarity"),
    depth: dimensionAverage("scoreDepth"),
    communication: dimensionAverage("scoreCommunication"),
  };

  return {
    totalInterviews: interviews.length,
    totalAnswers: answers.length,
    bestScore,
    averageScore,
    improvementPoints,
    skillAverages,
  };
}
