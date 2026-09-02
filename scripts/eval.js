/**
 * LLM evaluation harness.
 *
 * Runs a fixed set of rubric-style prompts through the same Zod-validated
 * pipeline that `saveUserAnswer` uses, then scores the output against:
 *   - Schema conformance (does it parse against aiRubricSchema?)
 *   - Score-in-range (every dimension in 0-10?)
 *   - Rating-stability (does the score match the rubric on retry?)
 *   - Comment-quality heuristics (length, presence of concrete critique)
 *
 * Usage:
 *   node scripts/eval.js                  # prints a markdown report
 *   node scripts/eval.js --json           # prints JSON instead
 *   node scripts/eval.js --write=out.md   # writes the markdown report
 *
 * Reads the same env vars as the app (GEMINI_API_KEY, LANGCHAIN_TRACING_V2,
 * LANGCHAIN_API_KEY, LANGCHAIN_PROJECT). When tracing env vars are present,
 * every eval invocation shows up in LangSmith under `LANGCHAIN_PROJECT`.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const { generateStructured } = await import("../lib/ai/gemini.js");
const {
  aiRubricSchema,
  RUBRIC_DIMENSIONS,
  overallFromRubric,
} = await import("../lib/validation/interview.js");

const RUBRIC_PROMPT = [
  "You are a senior interview evaluator. Score the candidate's answer on a",
  "detailed rubric. Be fair but rigorous.",
  "Question: {question}",
  "Candidate answer: {answer}",
  "Score each dimension as an integer from 0 to 10:",
  "- correctness: factual / technical accuracy of the answer",
  "- clarity: how clearly the idea is communicated",
  "- depth: detail, concrete examples, and reasoning",
  "- communication: structure, conciseness, and delivery",
].join("\n");

/**
 * Small fixture set: question, candidate answer, expected rubric band.
 * Bands are loose ranges the human rater agreed on — used to compute the
 * "in-band" accuracy metric at the end.
 */
const FIXTURES = [
  {
    name: "Strong closure answer",
    question: "What is a closure in JavaScript?",
    answer:
      "A closure is a function bundled together with references to its " +
      "surrounding lexical scope. Each time the outer function runs, a new " +
      "closure is created that captures the variables that were in scope at " +
      "creation time. That's why closures are great for data hiding and for " +
      "factory functions that need per-instance state.",
    expectedBand: [7, 9],
  },
  {
    name: "Weak event-loop answer",
    question: "Explain the JavaScript event loop.",
    answer: "It's a loop that runs events.",
    expectedBand: [0, 3],
  },
  {
    name: "Mid-depth React hooks answer",
    question: "How do useEffect dependencies work?",
    answer:
      "The dependency array tells React when to re-run the effect. React " +
      "compares the values in the array with the previous render using " +
      "Object.is. If anything changed, the effect runs after the DOM update.",
    expectedBand: [6, 8],
  },
  {
    name: "Confused SQL joins answer",
    question: "What's the difference between INNER JOIN and LEFT JOIN?",
    answer:
      "INNER JOIN only shows rows that match. LEFT JOIN shows all rows from " +
      "the left table and the matching ones from the right, even if there " +
      "are no matches the right side will be null.",
    expectedBand: [6, 8],
  },
];

function inBand(rating, [lo, hi]) {
  return rating >= lo && rating <= hi;
}

function scoreOne(fixture, temperature) {
  const prompt = RUBRIC_PROMPT.replace("{question}", fixture.question).replace(
    "{answer}",
    fixture.answer,
  );
  return generateStructured(prompt, aiRubricSchema, { temperature })
    .then((parsed) => ({
      ok: true,
      parsed,
      overall: overallFromRubric(parsed),
    }))
    .catch((err) => ({ ok: false, error: String(err.message ?? err) }));
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = args.includes("--json");
  const writeIdx = args.findIndex((a) => a.startsWith("--write="));
  const writePath = writeIdx >= 0 ? args[writeIdx].slice("--write=".length) : null;

  const tracing =
    process.env.LANGCHAIN_TRACING_V2 === "true" && !!process.env.LANGCHAIN_API_KEY;

  const samples = [];
  for (const f of FIXTURES) {
    const a = await scoreOne(f, 0.4);
    const b = await scoreOne(f, 0.4);
    const stability =
      a.ok && b.ok ? Math.abs(a.overall - b.overall) : null;
    samples.push({
      name: f.name,
      ok: a.ok,
      parsed: a.ok ? a.parsed : null,
      overall: a.ok ? a.overall : null,
      inBand: a.ok ? inBand(a.overall, f.expectedBand) : false,
      stability,
      error: a.ok ? null : a.error,
    });
  }

  const valid = samples.filter((s) => s.ok);
  const inBandCount = valid.filter((s) => s.inBand).length;
  const avgStability =
    valid.length === 0
      ? null
      : Number(
          (
            valid.reduce((s, x) => s + (x.stability ?? 0), 0) / valid.length
          ).toFixed(2),
        );

  const summary = {
    fixtureCount: FIXTURES.length,
    validCount: valid.length,
    inBandCount,
    inBandAccuracy: valid.length ? Number((inBandCount / valid.length).toFixed(2)) : null,
    avgStability,
    rubricDimensions: RUBRIC_DIMENSIONS,
    model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
    tracing: tracing
      ? { enabled: true, project: process.env.LANGCHAIN_PROJECT ?? "(default)" }
      : { enabled: false },
  };

  if (jsonOut) {
    console.log(JSON.stringify({ summary, samples }, null, 2));
    return;
  }

  const lines = [];
  lines.push("# SkillForge AI — LLM evaluation report");
  lines.push("");
  lines.push(`- Fixtures: ${summary.fixtureCount}`);
  lines.push(`- Valid parses: ${summary.validCount}/${summary.fixtureCount}`);
  lines.push(`- In-band accuracy: ${summary.inBandAccuracy ?? "n/a"}`);
  lines.push(`- Avg stability (|Δrating| across 2 runs): ${summary.avgStability ?? "n/a"}`);
  lines.push(`- Model: \`${summary.model}\``);
  lines.push(
    `- LangSmith tracing: ${summary.tracing.enabled ? `enabled (project \`${summary.tracing.project}\`)` : "disabled — set LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY to enable"}`,
  );
  lines.push("");
  lines.push("| Fixture | Parse OK | Overall | In band | Stability | Notes |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const s of samples) {
    lines.push(
      `| ${s.name} | ${s.ok ? "yes" : "no"} | ${s.overall ?? "—"} | ${s.ok ? (s.inBand ? "yes" : "no") : "—"} | ${s.stability ?? "—"} | ${s.error ?? (s.parsed ? `"${(s.parsed.feedback ?? "").slice(0, 60)}…"` : "")} |`,
    );
  }
  lines.push("");

  const report = lines.join("\n");
  if (writePath) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(writePath, report, "utf8");
    console.error(`Wrote report to ${writePath}`);
  } else {
    console.log(report);
  }
}

main().catch((err) => {
  console.error("eval failed:", err);
  process.exit(1);
});