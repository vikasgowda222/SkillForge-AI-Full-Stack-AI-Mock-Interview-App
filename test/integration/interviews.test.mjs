import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Mutable state shared with the module mocks below. Declared via vi.hoisted so
 * it is initialized before the (hoisted) vi.mock factories run.
 */
const state = vi.hoisted(() => ({
  userId: "user_123",
  email: "candidate@example.com",
  /** Queue of arrays returned by successive db.select() chains. */
  selectQueue: [],
  /** Value returned by the mocked generateJson(). */
  gen: null,
  /** Records every db.insert().values(...) payload. */
  inserted: [],
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: state.userId })),
  currentUser: vi.fn(async () =>
    state.email ? { primaryEmailAddress: { emailAddress: state.email } } : null,
  ),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/ratelimit", () => ({
  assertInterviewRateLimit: vi.fn(async () => {}),
  assertAnswerRateLimit: vi.fn(async () => {}),
  RateLimitError: class RateLimitError extends Error {},
}));

vi.mock("@/lib/ai/gemini", () => ({
  generateJson: vi.fn(async () => state.gen),
}));

vi.mock("@/utils/db", () => {
  // A thenable query-builder stub: every chain method returns the same object,
  // and awaiting it resolves to the value the provider yields.
  const makeChain = (provider) => {
    const chain = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.then = (resolve, reject) =>
      Promise.resolve(provider()).then(resolve, reject);
    return chain;
  };

  return {
    db: {
      select: vi.fn(() => makeChain(() => state.selectQueue.shift() ?? [])),
      insert: vi.fn(() => ({
        values: vi.fn(async (values) => {
          state.inserted.push(values);
        }),
      })),
      delete: vi.fn(() => makeChain(() => Promise.resolve())),
    },
  };
});

// Imported AFTER the mocks (vi.mock calls are hoisted above imports).
import {
  createInterview,
  deleteInterview,
  getDashboardStats,
  getFeedback,
  getInterviewById,
  getMyInterviews,
  saveUserAnswer,
} from "@/lib/actions/interviews";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const ownedRow = {
  id: 1,
  mockId: UUID,
  userId: "user_123",
  jobPosition: "Engineer",
  jobDesc: "desc",
  jsonMockResp: "[]",
};

beforeEach(() => {
  state.userId = "user_123";
  state.email = "candidate@example.com";
  state.selectQueue = [];
  state.gen = null;
  state.inserted.length = 0;
  vi.clearAllMocks();
});

describe("authentication guard", () => {
  beforeEach(() => {
    state.userId = null;
  });

  it("createInterview throws when unauthenticated", async () => {
    await expect(
      createInterview({
        jobPosition: "Engineer",
        jobDescription: "valid description",
        jobExperience: 3,
      }),
    ).rejects.toThrow("UNAUTHENTICATED");
  });

  it("read/list/stat actions throw when unauthenticated", async () => {
    await expect(getMyInterviews()).rejects.toThrow("UNAUTHENTICATED");
    await expect(getInterviewById(UUID)).rejects.toThrow("UNAUTHENTICATED");
    await expect(getDashboardStats()).rejects.toThrow("UNAUTHENTICATED");
    await expect(getFeedback(UUID)).rejects.toThrow("UNAUTHENTICATED");
  });

  it("mutating actions throw when unauthenticated", async () => {
    await expect(deleteInterview(UUID)).rejects.toThrow("UNAUTHENTICATED");
    await expect(
      saveUserAnswer({ mockId: UUID, question: "q", userAnswer: "an answer" }),
    ).rejects.toThrow("UNAUTHENTICATED");
  });
});

describe("createInterview", () => {
  it("validates input before doing any work", async () => {
    await expect(
      createInterview({
        jobPosition: "x", // too short
        jobDescription: "valid description",
        jobExperience: 3,
      }),
    ).rejects.toThrow();
    expect(state.inserted).toHaveLength(0);
  });

  it("generates, validates, and persists with the caller's userId", async () => {
    state.gen = Array.from({ length: 5 }, (_, i) => ({
      question: `Q${i}`,
      answer: `A${i}`,
    }));

    const result = await createInterview({
      jobPosition: "Frontend Engineer",
      jobDescription: "React and testing",
      jobExperience: "3",
    });

    expect(typeof result.mockId).toBe("string");
    expect(result.mockId.length).toBeGreaterThan(0);
    expect(state.inserted).toHaveLength(1);

    const row = state.inserted[0];
    expect(row.userId).toBe("user_123");
    expect(row.jobPosition).toBe("Frontend Engineer");
    expect(row.jobDesc).toBe("React and testing");
    expect(row.jobExperience).toBe("3");
    expect(row.createdBy).toBe("candidate@example.com");
    expect(JSON.parse(row.jsonMockResp)).toHaveLength(5);
  });

  it("rejects and stores nothing when the model returns invalid output", async () => {
    state.gen = []; // fails aiQuestionsSchema.min(1)
    await expect(
      createInterview({
        jobPosition: "Engineer",
        jobDescription: "valid description",
        jobExperience: 3,
      }),
    ).rejects.toThrow();
    expect(state.inserted).toHaveLength(0);
  });
});

describe("getInterviewById (ownership)", () => {
  it("returns the row when the user owns it", async () => {
    state.selectQueue = [[ownedRow]];
    await expect(getInterviewById(UUID)).resolves.toEqual(ownedRow);
  });

  it("returns null when no owned row matches", async () => {
    state.selectQueue = [[]];
    await expect(getInterviewById(UUID)).resolves.toBeNull();
  });
});

describe("deleteInterview (ownership)", () => {
  it("throws NOT_FOUND when the user does not own the interview", async () => {
    state.selectQueue = [[]]; // getInterviewById -> null
    await expect(deleteInterview(UUID)).rejects.toThrow("NOT_FOUND");
  });

  it("deletes when the user owns the interview", async () => {
    state.selectQueue = [[ownedRow]];
    await expect(deleteInterview(UUID)).resolves.toEqual({ ok: true });
  });
});

describe("saveUserAnswer (ownership)", () => {
  it("throws NOT_FOUND when the interview is not owned", async () => {
    state.selectQueue = [[]];
    await expect(
      saveUserAnswer({ mockId: UUID, question: "q", userAnswer: "an answer" }),
    ).rejects.toThrow("NOT_FOUND");
    expect(state.inserted).toHaveLength(0);
  });

  it("scores and stores the answer for an owned interview", async () => {
    state.selectQueue = [[ownedRow]];
    state.gen = { rating: 8, feedback: "Clear and well-structured." };

    const result = await saveUserAnswer({
      mockId: UUID,
      question: "What is a closure?",
      userAnswer: "A function bundled with its lexical scope.",
    });

    expect(result).toEqual({
      rating: 8,
      feedback: "Clear and well-structured.",
    });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].userId).toBe("user_123");
    expect(state.inserted[0].mockIdRef).toBe(UUID);
    expect(state.inserted[0].rating).toBe(8);
  });

  it("rejects a non-uuid mockId", async () => {
    await expect(
      saveUserAnswer({ mockId: "nope", question: "q", userAnswer: "answer" }),
    ).rejects.toThrow();
  });
});

describe("getFeedback", () => {
  it("returns empty feedback when the interview is not owned", async () => {
    state.selectQueue = [[]];
    await expect(getFeedback(UUID)).resolves.toEqual({
      interview: null,
      answers: [],
    });
  });

  it("returns the interview and its answers when owned", async () => {
    const answers = [{ id: 1, rating: 7 }];
    state.selectQueue = [[ownedRow], answers];
    await expect(getFeedback(UUID)).resolves.toEqual({
      interview: ownedRow,
      answers,
    });
  });
});

describe("getDashboardStats (NaN-safe aggregation)", () => {
  it("computes best/average/improvement from ratings", async () => {
    const interviews = [{ id: 1 }, { id: 2 }];
    const answers = [{ rating: 4 }, { rating: 7 }, { rating: 9 }];
    state.selectQueue = [interviews, answers];

    const stats = await getDashboardStats();
    expect(stats.totalInterviews).toBe(2);
    expect(stats.totalAnswers).toBe(3);
    expect(stats.bestScore).toBe(9);
    expect(stats.averageScore).toBe(6.7); // (4+7+9)/3 = 6.666… -> 6.7
    expect(stats.improvementPoints).toBe(5); // 9 - 4
  });

  it("returns nulls/zero when there are no ratings", async () => {
    state.selectQueue = [[], []];
    const stats = await getDashboardStats();
    expect(stats.totalInterviews).toBe(0);
    expect(stats.totalAnswers).toBe(0);
    expect(stats.bestScore).toBeNull();
    expect(stats.averageScore).toBeNull();
    expect(stats.improvementPoints).toBe(0);
  });

  it("ignores null/NaN ratings", async () => {
    const answers = [{ rating: null }, { rating: 6 }, { rating: Number.NaN }];
    state.selectQueue = [[{ id: 1 }], answers];
    const stats = await getDashboardStats();
    expect(stats.bestScore).toBe(6);
    expect(stats.averageScore).toBe(6);
  });
});
