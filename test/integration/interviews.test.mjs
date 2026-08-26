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
  /** Records every db.update().set(...) payload. */
  updated: [],
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
      update: vi.fn(() => ({
        set: (values) => {
          state.updated.push(values);
          return makeChain(() => Promise.resolve());
        },
      })),
      delete: vi.fn(() => makeChain(() => Promise.resolve())),
    },
  };
});

// Imported AFTER the mocks (vi.mock calls are hoisted above imports).
import {
  createInterview,
  deleteInterview,
  disableSharing,
  enableSharing,
  generateFollowUp,
  getAnalytics,
  getDashboardStats,
  getFeedback,
  getInterviewById,
  getMyInterviews,
  getSharedReport,
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
  state.updated.length = 0;
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
    await expect(
      generateFollowUp({ mockId: UUID, question: "q", userAnswer: "answer" }),
    ).rejects.toThrow("UNAUTHENTICATED");
    await expect(enableSharing(UUID)).rejects.toThrow("UNAUTHENTICATED");
    await expect(disableSharing(UUID)).rejects.toThrow("UNAUTHENTICATED");
    await expect(getAnalytics()).rejects.toThrow("UNAUTHENTICATED");
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
    state.gen = {
      correctness: 8,
      clarity: 7,
      depth: 6,
      communication: 9,
      overallRating: 8,
      feedback: "Clear and well-structured.",
    };

    const result = await saveUserAnswer({
      mockId: UUID,
      question: "What is a closure?",
      userAnswer: "A function bundled with its lexical scope.",
    });

    expect(result.rating).toBe(8);
    expect(result.feedback).toBe("Clear and well-structured.");
    expect(result.rubric).toEqual({
      correctness: 8,
      clarity: 7,
      depth: 6,
      communication: 9,
    });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0].userId).toBe("user_123");
    expect(state.inserted[0].mockIdRef).toBe(UUID);
    expect(state.inserted[0].rating).toBe(8);
    expect(state.inserted[0].scoreCorrectness).toBe(8);
    expect(state.inserted[0].scoreCommunication).toBe(9);
  });

  it("derives the overall rating from the mean when the model omits it", async () => {
    state.selectQueue = [[ownedRow]];
    state.gen = {
      correctness: 6,
      clarity: 7,
      depth: 5,
      communication: 8,
      // no overallRating -> mean(6,7,5,8) = 6.5 -> rounds to 7
      feedback: "Solid answer with room to go deeper.",
    };

    const result = await saveUserAnswer({
      mockId: UUID,
      question: "Explain event loop.",
      userAnswer: "The event loop processes the callback queue.",
    });

    expect(result.rating).toBe(7);
    expect(state.inserted[0].rating).toBe(7);
  });

  it("rejects and stores nothing when the rubric is invalid", async () => {
    state.selectQueue = [[ownedRow]];
    state.gen = { correctness: 99, clarity: 7, depth: 6, communication: 9 };
    await expect(
      saveUserAnswer({ mockId: UUID, question: "q", userAnswer: "an answer" }),
    ).rejects.toThrow();
    expect(state.inserted).toHaveLength(0);
  });

  it("rejects a non-uuid mockId", async () => {
    await expect(
      saveUserAnswer({ mockId: "nope", question: "q", userAnswer: "answer" }),
    ).rejects.toThrow();
  });
});

describe("generateFollowUp (agentic)", () => {
  it("throws NOT_FOUND when the interview is not owned", async () => {
    state.selectQueue = [[]];
    await expect(
      generateFollowUp({ mockId: UUID, question: "q", userAnswer: "answer" }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("returns a follow-up question for an owned interview", async () => {
    state.selectQueue = [[ownedRow]];
    state.gen = { question: "Can you give a concrete example?" };
    const result = await generateFollowUp({
      mockId: UUID,
      question: "What is a closure?",
      userAnswer: "A function with its scope.",
    });
    expect(result).toEqual({ question: "Can you give a concrete example?" });
  });

  it("rejects an empty follow-up from the model", async () => {
    state.selectQueue = [[ownedRow]];
    state.gen = { question: "" };
    await expect(
      generateFollowUp({ mockId: UUID, question: "q", userAnswer: "answer" }),
    ).rejects.toThrow();
  });
});

describe("sharing", () => {
  it("enableSharing mints a token for an owned interview", async () => {
    state.selectQueue = [[{ ...ownedRow, shareId: null }]];
    const result = await enableSharing(UUID);
    expect(typeof result.shareId).toBe("string");
    expect(result.shareId.length).toBeGreaterThan(0);
    expect(state.updated).toHaveLength(1);
    expect(state.updated[0].shareId).toBe(result.shareId);
  });

  it("enableSharing reuses an existing token (no new write)", async () => {
    state.selectQueue = [[{ ...ownedRow, shareId: "existing-token" }]];
    const result = await enableSharing(UUID);
    expect(result.shareId).toBe("existing-token");
    expect(state.updated).toHaveLength(0);
  });

  it("enableSharing throws NOT_FOUND when not owned", async () => {
    state.selectQueue = [[]];
    await expect(enableSharing(UUID)).rejects.toThrow("NOT_FOUND");
  });

  it("disableSharing clears the token for an owned interview", async () => {
    state.selectQueue = [[{ ...ownedRow, shareId: "t" }]];
    await expect(disableSharing(UUID)).resolves.toEqual({ ok: true });
    expect(state.updated[0].shareId).toBeNull();
  });

  it("getSharedReport returns null for an unknown token", async () => {
    state.selectQueue = [[]];
    await expect(getSharedReport("nope")).resolves.toBeNull();
  });

  it("getSharedReport returns a sanitized report (no userId/email)", async () => {
    const answers = [
      {
        id: 1,
        question: "Q1",
        rating: 8,
        feedback: "Good",
        userId: "user_123",
        userEmail: "secret@example.com",
        userAns: "private answer",
        scoreCorrectness: 8,
        scoreClarity: 7,
        scoreDepth: 6,
        scoreCommunication: 9,
      },
    ];
    state.selectQueue = [[{ ...ownedRow, shareId: "tok" }], answers];
    const report = await getSharedReport("tok");
    expect(report.jobPosition).toBe("Engineer");
    expect(report.answers).toHaveLength(1);
    // Sensitive fields must not leak into a public report.
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("user_123");
    expect(serialized).not.toContain("secret@example.com");
    expect(serialized).not.toContain("private answer");
  });
});

describe("getAnalytics", () => {
  it("builds a timeline, skill averages, and distribution", async () => {
    const answers = [
      {
        rating: 4,
        scoreCorrectness: 4,
        scoreClarity: 5,
        scoreDepth: 3,
        scoreCommunication: 6,
      },
      {
        rating: 8,
        scoreCorrectness: 8,
        scoreClarity: 7,
        scoreDepth: 9,
        scoreCommunication: 8,
      },
      { rating: null }, // unscored: ignored
    ];
    state.selectQueue = [answers];
    const a = await getAnalytics();
    expect(a.totalScored).toBe(2);
    expect(a.timeline).toEqual([
      { index: 1, rating: 4 },
      { index: 2, rating: 8 },
    ]);
    expect(a.skillAverages.correctness).toBe(6); // (4+8)/2
    const nineToTen = a.distribution.find((d) => d.band === "9-10");
    const threeToFour = a.distribution.find((d) => d.band === "3-4");
    expect(threeToFour.count).toBe(1); // rating 4
    expect(nineToTen.count).toBe(0);
  });

  it("returns empty analytics with no answers", async () => {
    state.selectQueue = [[]];
    const a = await getAnalytics();
    expect(a.totalScored).toBe(0);
    expect(a.timeline).toEqual([]);
    expect(a.skillAverages.correctness).toBeNull();
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

  it("averages rubric dimensions NaN-safely (null when unscored)", async () => {
    const answers = [
      {
        rating: 8,
        scoreCorrectness: 8,
        scoreClarity: 6,
        scoreDepth: 7,
        scoreCommunication: 9,
      },
      {
        rating: 6,
        scoreCorrectness: 6,
        scoreClarity: 8,
        scoreDepth: 5,
        scoreCommunication: null, // one dimension missing
      },
    ];
    state.selectQueue = [[{ id: 1 }], answers];
    const stats = await getDashboardStats();
    expect(stats.skillAverages).toEqual({
      correctness: 7, // (8+6)/2
      clarity: 7, // (6+8)/2
      depth: 6, // (7+5)/2
      communication: 9, // only one present
    });
  });

  it("returns null skill averages when no answer has rubric scores", async () => {
    const answers = [{ rating: 4 }, { rating: 7 }];
    state.selectQueue = [[{ id: 1 }], answers];
    const stats = await getDashboardStats();
    expect(stats.skillAverages).toEqual({
      correctness: null,
      clarity: null,
      depth: null,
      communication: null,
    });
  });
});
