import { z } from "zod";

/** Input for creating a new mock interview (from the "Add New" dialog). */
export const createInterviewInput = z.object({
  jobPosition: z.string().trim().min(2).max(120),
  jobDescription: z.string().trim().min(2).max(4000),
  jobExperience: z.coerce.number().int().min(0).max(70),
});

/** One AI-generated question + model answer. */
export const aiQuestionSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

/** The list of AI questions we accept back from the model. */
export const aiQuestionsSchema = z.array(aiQuestionSchema).min(1).max(10);

/** Input for saving a candidate's answer to one question. */
export const saveAnswerInput = z.object({
  mockId: z.string().uuid(),
  question: z.string().trim().min(1).max(4000),
  correctAns: z.string().max(8000).nullish(),
  userAnswer: z.string().trim().min(1).max(8000),
});

/** AI feedback shape we accept back from the model. */
export const aiFeedbackSchema = z.object({
  rating: z.coerce.number().int().min(0).max(10),
  feedback: z.string().min(1).max(8000),
});

/**
 * Gemini may wrap the questions array under various keys. Normalize the raw
 * parsed JSON to a bare array before schema validation.
 * @param {unknown} raw
 * @returns {unknown}
 */
export function normalizeQuestions(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = /** @type {Record<string, unknown>} */ (raw);
    for (const key of ["questions", "interviewQuestions", "data", "items"]) {
      if (Array.isArray(obj[key])) return obj[key];
    }
  }
  return raw;
}
