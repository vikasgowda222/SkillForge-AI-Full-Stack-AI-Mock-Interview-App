import "server-only";
import { z } from "zod";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { getChatModel } from "@/lib/ai/gemini";
import { fetchGitHubProfile } from "@/lib/integrations/github";

/**
 * LangGraph interview conductor.
 *
 * The graph replaces the single-shot `generateJson(prompt)` follow-up call
 * with a stateful, multi-turn loop that:
 *
 *   1. Maintains a rolling transcript of every Q/A so far in the session
 *      (graph state = the "memory" the resume claims).
 *   2. Lets the LLM call tools when it wants more context (e.g. look up the
 *      candidate's GitHub repos before asking a systems question).
 *   3. Re-loops until the model emits a structured `FinalQuestion`, or hits
 *      a step cap so it can never run forever.
 *
 * State shape (Annotation):
 *   {
 *     messages: BaseMessage[],       // built-in message reducer
 *     jobPosition: string,
 *     history: Array<{question,answer}>,
 *     latestQuestion: string,
 *     latestAnswer: string,
 *     finalQuestion: string|null,
 *     steps: number,
 *   }
 */

const MAX_STEPS = 4;

/** Zod schema for the structured final output the graph must produce. */
const finalQuestionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe("One focused follow-up interview question."),
});

/** Build the tools available to the agent node. */
function buildTools() {
  return [
    new DynamicStructuredTool({
      name: "lookup_github_profile",
      description:
        "Look up a candidate's public GitHub profile (bio, top repositories, " +
        "primary languages). Use this when the candidate references a project, " +
        "language, or pattern you want to probe concretely.",
      schema: z.object({
        username: z.string().min(1).describe("GitHub username (without '@')."),
      }),
      func: async ({ username }) => {
        try {
          const profile = await fetchGitHubProfile(username);
          return JSON.stringify({
            login: profile.login,
            bio: profile.bio,
            languages: profile.languages,
            topRepos: profile.topRepos.map((r) => ({
              name: r.name,
              language: r.language,
              stars: r.stars,
            })),
          });
        } catch (err) {
          return JSON.stringify({ error: String(err?.message ?? err) });
        }
      },
    }),
  ];
}

/** Build the LLM bound to the graph's tools. */
function buildLlmWithTools() {
  return getChatModel().bindTools(buildTools());
}

/**
 * Decide whether the agent emitted a structured final question yet, wants
 * to call a tool, or has run out of steps.
 */
function routeAfterAgent(state) {
  if (state.finalQuestion) return "finalize";
  if (state.steps >= MAX_STEPS) return "force_finalize";
  const last = state.messages[state.messages.length - 1];
  if (
    last &&
    (last.tool_calls?.length || last.additional_kwargs?.tool_calls?.length)
  ) {
    return "tools";
  }
  return "finalize";
}

/** The agent node: one LLM step given the current transcript memory. */
async function agentNode(state) {
  const systemPrompt = [
    "You are a senior technical interviewer conducting a live interview.",
    "Use the full transcript history to ask a follow-up that probes deeper, tests",
    "an edge case, or clarifies a gap. You may call tools (e.g. lookup_github_profile)",
    "to gather concrete context about the candidate before deciding.",
    "",
    `Role: ${state.jobPosition}`,
    "",
    "When you are ready to ask the follow-up, respond with ONLY this JSON:",
    '{"question": "<one focused follow-up question>"}',
    "Do not include any other text.",
  ].join("\n");

  const transcript = state.history
    .map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`)
    .join("\n\n");

  const userPrompt = [
    transcript ? `--- Transcript so far ---\n${transcript}` : "",
    `--- Most recent exchange ---`,
    `Question: ${state.latestQuestion}`,
    `Candidate answer: ${state.latestAnswer}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { HumanMessage } = await import("@langchain/core/messages");
  const response = await buildLlmWithTools().invoke(
    [
      { role: "system", content: systemPrompt },
      ...state.messages,
      new HumanMessage(userPrompt),
    ],
    { runName: "skillforge.followup.agent", tags: ["skillforge", "followup"] },
  );

  // Try to lift a JSON {question: ...} out of plain content; otherwise the
  // model asked for a tool call (no content) and the conditional edge routes
  // us to the tool node.
  let finalQuestion = null;
  const content = typeof response.content === "string" ? response.content : "";
  const match = content.match(/\{[\s\S]*?"question"[\s\S]*?\}/);
  if (match) {
    try {
      finalQuestion = finalQuestionSchema.parse(JSON.parse(match[0])).question;
    } catch {
      // ignore: model emitted invalid JSON, fall through to tool/loop logic
    }
  }

  return {
    messages: [response],
    finalQuestion,
    steps: state.steps + 1,
  };
}

/** Tool node: execute any tool calls the agent requested. */
async function toolNode(state) {
  const last = state.messages[state.messages.length - 1];
  const calls = last?.tool_calls ?? last?.additional_kwargs?.tool_calls ?? [];
  const toolResults = [];
  const tools = Object.fromEntries(buildTools().map((t) => [t.name, t]));

  for (const call of calls) {
    const tool = tools[call.name];
    if (!tool) continue;
    let args = {};
    try {
      args = typeof call.args === "string" ? JSON.parse(call.args) : call.args;
    } catch {
      args = {};
    }
    const output = await tool.func(args);
    toolResults.push(
      new ToolMessage({
        content: output,
        name: tool.name,
        tool_call_id: call.id,
      }),
    );
  }

  return { messages: toolResults };
}

/** Last-resort node: when the step cap is hit, force a follow-up. */
async function forceFinalizeNode(state) {
  const fallback = await getChatModel().invoke(
    [
      {
        role: "system",
        content:
          "You are a senior technical interviewer. The candidate answered: " +
          `"${state.latestAnswer}". Ask ONE focused follow-up question in JSON: ` +
          '{"question": "<your question>"}',
      },
    ],
    { runName: "skillforge.followup.forceFinalize" },
  );
  let finalQuestion =
    "Could you give a concrete example of what you described?";
  try {
    const m =
      typeof fallback.content === "string"
        ? fallback.content.match(/\{[\s\S]*?"question"[\s\S]*?\}/)
        : null;
    if (m) finalQuestion = finalQuestionSchema.parse(JSON.parse(m[0])).question;
  } catch {
    /* keep fallback */
  }
  return { finalQuestion };
}

/** Terminal node: validates and returns the final question. */
function finalizeNode(state) {
  if (!state.finalQuestion) {
    throw new Error("Follow-up graph ended without a finalQuestion.");
  }
  return {};
}

/** Build a fresh compiled graph. Stateless per call — memory lives in state. */
function buildGraph() {
  const State = Annotation.Root({
    messages: Annotation({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
    jobPosition: Annotation({
      reducer: (x, y) => y ?? x,
      default: () => "",
    }),
    history: Annotation({
      reducer: (x, y) => y ?? x,
      default: () => [],
    }),
    latestQuestion: Annotation({
      reducer: (x, y) => y ?? x,
      default: () => "",
    }),
    latestAnswer: Annotation({
      reducer: (x, y) => y ?? x,
      default: () => "",
    }),
    finalQuestion: Annotation({
      reducer: (x, y) => y ?? x,
      default: () => null,
    }),
    steps: Annotation({
      reducer: (x, y) => y ?? x,
      default: () => 0,
    }),
  });

  const workflow = new StateGraph(State)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addNode("finalize", finalizeNode)
    .addNode("force_finalize", forceFinalizeNode);

  workflow.addEdge(START, "agent");
  workflow.addConditionalEdges("agent", routeAfterAgent, {
    tools: "tools",
    finalize: "finalize",
    force_finalize: "force_finalize",
  });
  workflow.addEdge("tools", "agent");
  workflow.addEdge("force_finalize", "finalize");
  workflow.addEdge("finalize", END);

  return workflow.compile();
}

/** Lazy singleton — graphs are cheap but compilation is not free. */
let _graph;
function getGraph() {
  if (!_graph) _graph = buildGraph();
  return _graph;
}

/**
 * Public entry point. Mirrors the old `generateFollowUp` signature so the
 * action layer doesn't change.
 *
 * @param {{
 *   jobPosition: string,
 *   previousQuestions?: Array<{ question: string, answer: string }>,
 *   question: string,
 *   userAnswer: string,
 * }} args
 * @returns {Promise<{ question: string }>}
 */
export async function runFollowUpGraph(args) {
  const initial = {
    jobPosition: args.jobPosition,
    history: args.previousQuestions ?? [],
    latestQuestion: args.question,
    latestAnswer: args.userAnswer,
    messages: [],
    finalQuestion: null,
    steps: 0,
  };

  const result = await getGraph().invoke(initial, {
    runName: "skillforge.followup",
    tags: ["skillforge", "followup", "langgraph"],
    recursionLimit: 12,
  });

  if (!result.finalQuestion) {
    throw new Error("Follow-up graph produced no question.");
  }
  return { question: result.finalQuestion };
}
