import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/utils/db";
import { MockInterview, UserAnswer } from "@/utils/schema";

/** Thrown when a user exceeds an allowed action rate. */
export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded. Please try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Serverless-safe per-user throttle backed by row counts (works across
 * instances, unlike in-memory). Upgraded to Upstash Redis in the infra phase.
 */
async function countSince(table, userId, sinceMs) {
  const since = new Date(Date.now() - sinceMs);
  const rows = await db
    .select({ value: count() })
    .from(table)
    .where(and(eq(table.userId, userId), gte(table.createdAt, since)));
  return rows[0]?.value ?? 0;
}

const INTERVIEW_LIMIT_PER_HOUR = Number(
  process.env.RATE_LIMIT_INTERVIEWS_PER_HOUR || 30,
);
const ANSWER_LIMIT_PER_HOUR = Number(
  process.env.RATE_LIMIT_ANSWERS_PER_HOUR || 200,
);

/** @param {string} userId */
export async function assertInterviewRateLimit(userId) {
  const used = await countSince(MockInterview, userId, HOUR_MS);
  if (used >= INTERVIEW_LIMIT_PER_HOUR) {
    throw new RateLimitError(
      "You've created a lot of interviews recently. Please try again in a little while.",
    );
  }
}

/** @param {string} userId */
export async function assertAnswerRateLimit(userId) {
  const used = await countSince(UserAnswer, userId, HOUR_MS);
  if (used >= ANSWER_LIMIT_PER_HOUR) {
    throw new RateLimitError(
      "You've submitted a lot of answers recently. Please try again in a little while.",
    );
  }
}
