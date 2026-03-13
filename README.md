# Documentation Generation & Localization Engine

Monorepo scaffold for an API-first documentation generation workflow with FastAPI, React, local RAG, and .docx structural translation.

## Structure

- `backend/`: FastAPI API, session state, ingestion pipeline, RAG service, LLM provider, and export logic.
- `frontend/`: React + Tailwind workstation with ingest, refine, and export flows.

## Local development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Use Python 3.12 or 3.13 for local backend setup. The current pinned dependency set does not install cleanly on Python 3.14 because of upstream wheel support.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Docker Compose

```bash
docker compose up --build
```

The backend defaults to `http://localhost:8000`, and the frontend is served at `http://localhost:3000`.

## llama.cpp from Docker

When the backend runs on your laptop, `LLM_BASE_URL=http://localhost:8050/v1` is correct. When the backend runs inside Docker, `localhost` points at the container, not your laptop, so `docker-compose.yml` overrides the backend to use `http://host.docker.internal:8050/v1`.

On macOS, Docker Desktop resolves `host.docker.internal` to the host automatically. The compose file also includes an `extra_hosts` entry so the same setup is portable to Linux environments that support `host-gateway`.

To verify the container can reach llama.cpp:

```bash
docker compose exec backend curl http://host.docker.internal:8050/v1/models
```

## Batch Mode

Use the batch client to submit a template, examples, a refinement prompt, and export languages entirely over the REST API:

```bash
cd backend
python scripts/run_batch_workflow.py \
	--base-url http://localhost:8000 \
	--template tests/fixtures/template.docx \
	--good-example tests/fixtures/good_example.txt \
	--bad-example tests/fixtures/bad_example.txt \
	--message "Create a compliance onboarding specification for regulated enterprise customers." \
	--language Spanish \
	--language French
```

## Tests

The integration test generates a sample `.docx` template, posts it through `/ingest`, `/chat`, and `/export`, and asserts that the ZIP archive and localized documents are produced:

```bash
cd backend
python -m pip install -r requirements-test.txt
pytest tests/test_batch_workflow.py
```

Test assets live under [backend/tests/fixtures](backend/tests/fixtures). The main batch prompt is in [backend/tests/fixtures/chat_prompt.txt](backend/tests/fixtures/chat_prompt.txt), while the `.docx` template is generated dynamically by the shared fixture in [backend/tests/conftest.py](backend/tests/conftest.py) because it is easier to keep readable and editable in code than to store a binary file in the repo.

To run the opt-in integration test that really calls your configured llama.cpp endpoint:

```bash
cd backend
RUN_REAL_LLM_TESTS=1 pytest tests/test_real_llm_workflow.py
```

That test uses the real `LLMProvider`, skips automatically if the endpoint is not reachable, and asserts that `/chat` and `/export` complete successfully with the live model.

## Scenarios

Saved scenarios are persisted under the repository root in the [scenarios](scenarios) folder. Each scenario directory stores:

- the SQLite metadata database at [scenarios/scenarios.db](scenarios/scenarios.db)
- the uploaded template
- the uploaded good and bad examples
- the last saved prompt
- the current draft document state
- the target languages selected for export
- the custom output filename used for exports

Use the scenario controls in the app header to load an existing scenario ID from the list on the first screen or save the currently loaded session from any screen.

When running through Docker Compose, the backend mounts [scenarios](scenarios) into the container so scenario metadata and copied files persist across container restarts.