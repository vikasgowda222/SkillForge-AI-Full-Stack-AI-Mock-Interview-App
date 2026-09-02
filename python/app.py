"""
SkillForge AI — Python eval microservice (FastAPI).

Mirrors the JS `scripts/eval.js` so an external caller (CI, the Next.js
eval script, a recruiter poking at the API) can trigger an eval run and
get the same schema-conformance / in-band / stability metrics back as
JSON. This is the Python + FastAPI piece of the stack — it exists so
the AI layer is testable from a second language and so CI doesn't need
Node.

Endpoints:
  GET  /healthz                liveness
  GET  /v1/fixtures            the eval fixtures (so callers know what we test)
  POST /v1/eval                run the eval; returns the full report
  POST /v1/score               score a single (question, answer) pair
"""

import os
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import google.generativeai as genai

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
RUBRIC_PROMPT = "\n".join(
    [
        "You are a senior interview evaluator. Score the candidate's answer on a",
        "detailed rubric. Be fair but rigorous.",
        "Question: {question}",
        "Candidate answer: {answer}",
        "Score each dimension as an integer from 0 to 10:",
        "- correctness: factual / technical accuracy of the answer",
        "- clarity: how clearly the idea is communicated",
        "- depth: detail, concrete examples, and reasoning",
        "- communication: structure, conciseness, and delivery",
    ]
)

FIXTURES = [
    {
        "name": "Strong closure answer",
        "question": "What is a closure in JavaScript?",
        "answer": (
            "A closure is a function bundled together with references to its "
            "surrounding lexical scope. Each time the outer function runs, a new "
            "closure is created that captures the variables that were in scope at "
            "creation time. That's why closures are great for data hiding and for "
            "factory functions that need per-instance state."
        ),
        "expected_band": [7, 9],
    },
    {
        "name": "Weak event-loop answer",
        "question": "Explain the JavaScript event loop.",
        "answer": "It's a loop that runs events.",
        "expected_band": [0, 3],
    },
    {
        "name": "Mid-depth React hooks answer",
        "question": "How do useEffect dependencies work?",
        "answer": (
            "The dependency array tells React when to re-run the effect. React "
            "compares the values in the array with the previous render using "
            "Object.is. If anything changed, the effect runs after the DOM update."
        ),
        "expected_band": [6, 8],
    },
    {
        "name": "Confused SQL joins answer",
        "question": "What's the difference between INNER JOIN and LEFT JOIN?",
        "answer": (
            "INNER JOIN only shows rows that match. LEFT JOIN shows all rows from "
            "the left table and the matching ones from the right, even if there "
            "are no matches the right side will be null."
        ),
        "expected_band": [6, 8],
    },
]

RUBRIC_DIMENSIONS = ["correctness", "clarity", "depth", "communication"]

app = FastAPI(
    title="SkillForge AI — Eval Service",
    version="0.1.0",
    description=(
        "FastAPI mirror of the JS eval harness. Same fixtures, same Zod-equivalent "
        "(Pydantic) rubric schema, same metrics. Used by CI and by the Next.js "
        "`scripts/eval.js` when EVAL_SERVICE_URL is set."
    ),
)

# Permissive CORS so the local Next.js eval script and the browser can call it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScoreRequest(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)
    temperature: float = Field(default=0.4, ge=0.0, le=2.0)


class Rubric(BaseModel):
    correctness: int = Field(ge=0, le=10)
    clarity: int = Field(ge=0, le=10)
    depth: int = Field(ge=0, le=10)
    communication: int = Field(ge=0, le=10)
    overallRating: Optional[int] = Field(default=None, ge=0, le=10)
    feedback: str = Field(min_length=1)


class SampleResult(BaseModel):
    name: str
    ok: bool
    parsed: Optional[Rubric]
    overall: Optional[int]
    inBand: bool
    stability: Optional[float]
    error: Optional[str]


class EvalSummary(BaseModel):
    fixtureCount: int
    validCount: int
    inBandCount: int
    inBandAccuracy: Optional[float]
    avgStability: Optional[float]
    rubricDimensions: list[str]
    model: str
    tracing: dict


class EvalReport(BaseModel):
    summary: EvalSummary
    samples: list[SampleResult]


def _in_band(rating: int, band: list[int]) -> bool:
    return band[0] <= rating <= band[1]


def _overall(rubric: Rubric) -> int:
    if rubric.overallRating is not None:
        return rubric.overallRating
    dims = [rubric.correctness, rubric.clarity, rubric.depth, rubric.communication]
    return round(sum(dims) / len(dims))


def _score_one(fixture: dict, temperature: float) -> SampleResult:
    if not GEMINI_API_KEY:
        return SampleResult(
            name=fixture["name"],
            ok=False,
            parsed=None,
            overall=None,
            inBand=False,
            stability=None,
            error="GEMINI_API_KEY not set in eval service environment",
        )
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        generation_config={
            "temperature": temperature,
            "response_mime_type": "application/json",
        },
    )
    prompt = (
        RUBRIC_PROMPT.replace("{question}", fixture["question"]).replace(
            "{answer}", fixture["answer"]
        )
    )
    try:
        text = model.generate_content(prompt).text
        raw = json.loads(text.strip().strip("`").strip("json").strip())
        rubric = Rubric.model_validate(raw)
    except Exception as exc:  # noqa: BLE001 — surface anything to the caller
        return SampleResult(
            name=fixture["name"],
            ok=False,
            parsed=None,
            overall=None,
            inBand=False,
            stability=None,
            error=str(exc),
        )
    overall = _overall(rubric)
    return SampleResult(
        name=fixture["name"],
        ok=True,
        parsed=rubric,
        overall=overall,
        inBand=_in_band(overall, fixture["expected_band"]),
        stability=None,
        error=None,
    )


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "model": GEMINI_MODEL}


@app.get("/v1/fixtures")
def fixtures() -> dict:
    return {"fixtures": FIXTURES}


@app.post("/v1/score", response_model=Rubric)
def score(req: ScoreRequest) -> Rubric:
    rubric = _score_one(
        {
            "question": req.question,
            "answer": req.answer,
            "expected_band": [0, 10],
        },
        req.temperature,
    )
    if not rubric.ok or rubric.parsed is None:
        raise HTTPException(status_code=502, detail=rubric.error or "scoring failed")
    return rubric.parsed


@app.post("/v1/eval", response_model=EvalReport)
def run_eval() -> EvalReport:
    samples: list[SampleResult] = []
    for fixture in FIXTURES:
        a = _score_one(fixture, 0.4)
        b = _score_one(fixture, 0.4)
        if a.ok and b.ok and a.overall is not None and b.overall is not None:
            a.stability = float(abs(a.overall - b.overall))
        samples.append(a)

    valid = [s for s in samples if s.ok]
    in_band_count = sum(1 for s in valid if s.inBand)
    avg_stability = (
        round(sum(s.stability or 0 for s in valid) / len(valid), 2)
        if valid
        else None
    )
    summary = EvalSummary(
        fixtureCount=len(FIXTURES),
        validCount=len(valid),
        inBandCount=in_band_count,
        inBandAccuracy=(
            round(in_band_count / len(valid), 2) if valid else None
        ),
        avgStability=avg_stability,
        rubricDimensions=RUBRIC_DIMENSIONS,
        model=GEMINI_MODEL,
        tracing={"enabled": False, "note": "LangSmith tracing lives in the JS pipeline"},
    )
    return EvalReport(summary=summary, samples=samples)