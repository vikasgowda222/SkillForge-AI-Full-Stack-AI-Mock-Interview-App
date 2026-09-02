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

/** AI feedback shape we accept back from the model (legacy single-score). */
export const aiFeedbackSchema = z.object({
  rating: z.coerce.number().int().min(0).max(10),
  feedback: z.string().min(1).max(8000),
});

/**
 * The four scoring dimensions of the interview rubric. Kept as a constant so
 * the prompt, the schema, the DB columns, and the analytics all agree on the
 * same set (and stay in sync if it ever changes).
 * @type {readonly ["correctness", "clarity", "depth", "communication"]}
 */
export const RUBRIC_DIMENSIONS = [
  "correctness",
  "clarity",
  "depth",
  "communication",
];

/**
 * Multi-dimensional rubric scoring returned by the model. Each dimension is an
 * integer 0-10. `overallRating` is optional — the server derives it from the
 * mean when the model omits it — so the stored overall is always defined.
 */
export const aiRubricSchema = z.object({
  correctness: z.coerce.number().int().min(0).max(10),
  clarity: z.coerce.number().int().min(0).max(10),
  depth: z.coerce.number().int().min(0).max(10),
  communication: z.coerce.number().int().min(0).max(10),
  overallRating: z.coerce.number().int().min(0).max(10).optional(),
  feedback: z.string().trim().min(1).max(8000),
});

/**
 * Collapse a validated rubric to a single 0-10 overall score. Uses the model's
 * `overallRating` when present, otherwise the rounded mean of the dimensions.
 * @param {import("zod").infer<typeof aiRubricSchema>} rubric
 * @returns {number} integer 0-10
 */
export function overallFromRubric(rubric) {
  if (typeof rubric.overallRating === "number") return rubric.overallRating;
  const mean =
    RUBRIC_DIMENSIONS.reduce((sum, dim) => sum + rubric[dim], 0) /
    RUBRIC_DIMENSIONS.length;
  return Math.round(mean);
}

/** Input for generating an adaptive follow-up question for a given answer. */
export const followUpInput = z.object({
  mockId: z.string().uuid(),
  question: z.string().trim().min(1).max(4000),
  userAnswer: z.string().trim().min(1).max(8000),
});

/** The adaptive follow-up question we accept back from the model. */
export const aiFollowUpSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

/**
 * Input for generating an interview tailored to a candidate's resume text plus
 * a target role/description. Resume text is bounded to keep prompts sane.
 */
export const createFromResumeInput = z.object({
  resumeText: z.string().trim().min(30).max(20000),
  jobPosition: z.string().trim().min(2).max(120),
  jobDescription: z.string().trim().max(4000).optional().default(""),
  jobExperience: z.coerce.number().int().min(0).max(70).optional().default(0),
});

/** A GitHub username per GitHub's own rules (alphanumeric + single hyphens). */
export const githubUsernameInput = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(
      /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
      "Invalid GitHub username.",
    ),
  jobPosition: z.string().trim().min(2).max(120),
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
