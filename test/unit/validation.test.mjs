import { describe, it, expect } from "vitest";
import {
  aiFeedbackSchema,
  aiFollowUpSchema,
  aiQuestionsSchema,
  aiRubricSchema,
  createInterviewInput,
  followUpInput,
  normalizeQuestions,
  overallFromRubric,
  saveAnswerInput,
} from "@/lib/validation/interview";

describe("createInterviewInput", () => {
  it("accepts valid input and coerces experience to a number", () => {
    const parsed = createInterviewInput.parse({
      jobPosition: "Frontend Engineer",
      jobDescription: "React, testing, accessibility",
      jobExperience: "3",
    });
    expect(parsed.jobExperience).toBe(3);
    expect(parsed.jobPosition).toBe("Frontend Engineer");
  });

  it("trims surrounding whitespace", () => {
    const parsed = createInterviewInput.parse({
      jobPosition: "  Backend Engineer  ",
      jobDescription: "  Node and Postgres  ",
      jobExperience: 2,
    });
    expect(parsed.jobPosition).toBe("Backend Engineer");
    expect(parsed.jobDescription).toBe("Node and Postgres");
  });

  it("rejects a too-short job position", () => {
    expect(() =>
      createInterviewInput.parse({
        jobPosition: "x",
        jobDescription: "valid description",
        jobExperience: 1,
      }),
    ).toThrow();
  });

  it("rejects an out-of-range experience", () => {
    expect(() =>
      createInterviewInput.parse({
        jobPosition: "Engineer",
        jobDescription: "valid description",
        jobExperience: 99,
      }),
    ).toThrow();
  });
});

describe("saveAnswerInput", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts a valid uuid mockId and optional correctAns", () => {
    const parsed = saveAnswerInput.parse({
      mockId: uuid,
      question: "What is a closure?",
      userAnswer: "A function bundled with its lexical scope.",
    });
    expect(parsed.mockId).toBe(uuid);
    expect(parsed.correctAns ?? null).toBe(null);
  });

  it("rejects a non-uuid mockId", () => {
    expect(() =>
      saveAnswerInput.parse({
        mockId: "not-a-uuid",
        question: "q",
        userAnswer: "a valid answer",
      }),
    ).toThrow();
  });

  it("rejects a blank user answer", () => {
    expect(() =>
      saveAnswerInput.parse({ mockId: uuid, question: "q", userAnswer: "   " }),
    ).toThrow();
  });
});

describe("aiQuestionsSchema", () => {
  it("accepts a non-empty array of question/answer objects", () => {
    const data = [{ question: "Q1", answer: "A1" }];
    expect(aiQuestionsSchema.parse(data)).toHaveLength(1);
  });

  it("rejects an empty array", () => {
    expect(() => aiQuestionsSchema.parse([])).toThrow();
  });

  it("rejects an object missing its answer", () => {
    expect(() => aiQuestionsSchema.parse([{ question: "Q1" }])).toThrow();
  });

  it("rejects more than 10 questions", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      question: `Q${i}`,
      answer: `A${i}`,
    }));
    expect(() => aiQuestionsSchema.parse(many)).toThrow();
  });
});

describe("aiFeedbackSchema", () => {
  it("coerces a numeric string rating", () => {
    const parsed = aiFeedbackSchema.parse({
      rating: "8",
      feedback: "Solid, well-structured answer.",
    });
    expect(parsed.rating).toBe(8);
  });

  it("rejects a rating above 10", () => {
    expect(() =>
      aiFeedbackSchema.parse({ rating: 11, feedback: "too high" }),
    ).toThrow();
  });

  it("rejects empty feedback", () => {
    expect(() => aiFeedbackSchema.parse({ rating: 5, feedback: "" })).toThrow();
  });
});

describe("normalizeQuestions", () => {
  const arr = [{ question: "q", answer: "a" }];

  it("returns an array unchanged", () => {
    expect(normalizeQuestions(arr)).toBe(arr);
  });

  it("unwraps common envelope keys", () => {
    expect(normalizeQuestions({ questions: arr })).toBe(arr);
    expect(normalizeQuestions({ interviewQuestions: arr })).toBe(arr);
    expect(normalizeQuestions({ data: arr })).toBe(arr);
    expect(normalizeQuestions({ items: arr })).toBe(arr);
  });

  it("passes through a value it cannot normalize", () => {
    expect(normalizeQuestions("nope")).toBe("nope");
    expect(normalizeQuestions({ foo: 1 })).toEqual({ foo: 1 });
  });
});

describe("aiRubricSchema", () => {
  const valid = {
    correctness: 8,
    clarity: 7,
    depth: 6,
    communication: 9,
    overallRating: 8,
    feedback: "Well structured and accurate.",
  };

  it("accepts a full rubric and coerces numeric strings", () => {
    const parsed = aiRubricSchema.parse({ ...valid, correctness: "8" });
    expect(parsed.correctness).toBe(8);
    expect(parsed.communication).toBe(9);
  });

  it("treats overallRating as optional", () => {
    const parsed = aiRubricSchema.parse({
      correctness: 8,
      clarity: 7,
      depth: 6,
      communication: 9,
      feedback: "Well structured and accurate.",
    });
    expect(parsed.overallRating).toBeUndefined();
  });

  it("rejects a dimension above 10", () => {
    expect(() => aiRubricSchema.parse({ ...valid, depth: 11 })).toThrow();
  });

  it("rejects a missing dimension", () => {
    expect(() =>
      aiRubricSchema.parse({
        correctness: 8,
        depth: 6,
        communication: 9,
        overallRating: 8,
        feedback: "missing clarity",
      }),
    ).toThrow();
  });

  it("rejects empty feedback", () => {
    expect(() => aiRubricSchema.parse({ ...valid, feedback: "  " })).toThrow();
  });
});

describe("overallFromRubric", () => {
  it("uses the model's overallRating when present", () => {
    expect(
      overallFromRubric({
        correctness: 1,
        clarity: 1,
        depth: 1,
        communication: 1,
        overallRating: 9,
      }),
    ).toBe(9);
  });

  it("rounds the mean of the four dimensions when overall is absent", () => {
    // mean(6,7,5,8) = 6.5 -> 7
    expect(
      overallFromRubric({
        correctness: 6,
        clarity: 7,
        depth: 5,
        communication: 8,
      }),
    ).toBe(7);
  });
});

describe("followUpInput", () => {
  const uuid = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts a valid follow-up request", () => {
    const parsed = followUpInput.parse({
      mockId: uuid,
      question: "What is a closure?",
      userAnswer: "A function with its scope.",
    });
    expect(parsed.mockId).toBe(uuid);
  });

  it("rejects a non-uuid mockId", () => {
    expect(() =>
      followUpInput.parse({
        mockId: "nope",
        question: "q",
        userAnswer: "answer",
      }),
    ).toThrow();
  });
});

describe("aiFollowUpSchema", () => {
  it("accepts a non-empty question", () => {
    expect(aiFollowUpSchema.parse({ question: "Why?" }).question).toBe("Why?");
  });

  it("rejects an empty question", () => {
    expect(() => aiFollowUpSchema.parse({ question: "" })).toThrow();
  });
});
