# SkillForge AI — Python eval microservice

FastAPI mirror of the JS `scripts/eval.js`. Same fixtures, same metrics
(schema conformance, in-band accuracy, stability across 2 runs). Used by
CI and by the Node.js eval script when `EVAL_SERVICE_URL` is set.

## Run

```bash
cd python
python -m venv .venv
. .venv/Scripts/activate           # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Then either:

- OpenAPI docs at http://localhost:8000/docs
- `curl -X POST http://localhost:8000/v1/eval | jq`

## Endpoints

- `GET  /healthz` — liveness
- `GET  /v1/fixtures` — list the eval fixtures
- `POST /v1/score` — score a single `{question, answer}` pair
- `POST /v1/eval` — run the full eval suite, return the report

## Environment

Reads `GEMINI_API_KEY` and `GEMINI_MODEL` from the project's `.env.local`
(two levels up). Same contract as the JS code.

## Why a Python service?

The interview generation + scoring pipeline is JavaScript (LangChain /
LangGraph on Node.js). The Python + FastAPI side handles evaluation:

- Same fixtures and metrics contract as the JS harness, callable over HTTP.
- CI can hit `/v1/eval` directly without a Node dependency in the loop.
- Reusable REST surface for any future ML experiment, dashboard, or
  evaluation runner.