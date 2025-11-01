# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Test Case Generator Backend - A FastAPI application that automatically generates test cases from requirements documents using Google Gemini/Vertex AI. The system extracts structured information from healthcare requirements, converts them to test cases, and integrates with Jira for enterprise ALM workflows.

### Key Features
- Document upload and text extraction (PDF, XLSX, CSV, plain text)
- Requirement extraction and structuring using LLM
- Test case generation with multiple types (positive, negative, boundary)
- LLM-as-a-Judge evaluation system for test quality
- Jira integration for pushing test cases
- Export functionality for different formats

## Tech Stack

- **Framework**: FastAPI with Uvicorn
- **Database**: SQLModel (SQLAlchemy + Pydantic) with SQLite (development) / PostgreSQL (production via `DATABASE_URL`)
- **AI**: Google Gemini/Vertex AI APIs via `google-genai` and `google-generativeai`
- **Document Processing**: PyPDF2, Pandas, openpyxl, Google Document AI
- **ALM Integration**: Jira Python client
- **Auth**: GCP Service Account authentication with Application Default Credentials (ADC)

## Setup & Installation

1. **Python Environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # or .\venv\Scripts\Activate.ps1 on Windows
   pip install -r requirements.txt
   ```

2. **Environment Configuration**:
   - Copy `.env.example` to `.env`
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to your GCP service account JSON path
   - Set `GCP_PROJECT` to your GCP project ID
   - Set `GENAI_MODEL` (defaults to `gemini-2.5-flash-lite`)
   - Optional: Set `DATABASE_URL` (defaults to `sqlite:///data.db`)

3. **GCP Setup**:
   - Enable Vertex AI API in your GCP project
   - Create and download a service account JSON key
   - Set up Google Application Default Credentials (ADC)

## Running the Application

```bash
# Development with auto-reload
uvicorn app:app --reload

# With specific host/port
uvicorn app:app --host 0.0.0.0 --port 8000

# Production
gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker
```

App runs on `http://localhost:8000` with API docs at `/docs`

## Architecture & Data Flow

### Database Models (`src/models.py`)

- **Document**: Uploaded requirement files (versioning support via `version` and `upload_session_id`)
- **Requirement**: Extracted requirements with structured JSON, confidence scores, and status tracking
- **TestCase**: Generated test cases linked to requirements with Gherkin, sample data, and code scaffolds
- **ReviewEvent**: Audit trail for requirement reviews with diffs and reviewer feedback
- **GenerationEvent**: Audit trail for test generation calls with model metadata and prompts

### Core Processing Pipeline

1. **Files Router** (`src/routers/files_router.py`): Document upload endpoint
2. **Extraction Router** (`src/routers/extraction_router.py`):
   - Extracts text from uploaded documents
   - Calls `call_vertex_extraction()` for each paragraph
   - Creates Requirement records with structured JSON and confidence scores
3. **Generation Router** (`src/routers/generate_router.py`):
   - Builds generation prompts with requirement context
   - Calls `call_vertex_generation()` with test type (positive/negative/boundary)
   - Creates TestCase records with Gherkin, evidence, automated steps, sample data, and code scaffolds
4. **Review Router** (`src/routers/review_router.py`): Requirement review and approval workflow
5. **Export Router** (`src/routers/export_router.py`): Export test cases in multiple formats
6. **Jira Router**: Integration for pushing test cases to Jira

### Service Layer

- **`src/services/extraction.py`**: LLM-based requirement extraction with Pydantic validation
  - Uses prompt templates from `src/services/prompts/`
  - Returns structured data with field-level confidence scores
  - Handles retries with exponential backoff via `tenacity`

- **`src/services/gemini_client.py`**: LLM-as-a-Judge implementation
  - Evaluates generated test cases using rubric scoring
  - Returns feedback, evaluation rationale, and numeric ratings (1-4 scale)

- **`src/services/jira_client.py`**: Jira integration for test case management

- **`src/services/document_parser.py`**: Enhanced document parsing utilities

- **`src/utils/pdf_parser.py`**: PDF extraction helper functions

## API Endpoints Overview

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/upload` | Upload requirement document |
| POST | `/api/extract/{doc_id}` | Extract and structure requirements |
| POST | `/api/generate/preview` | Generate preview test cases |
| POST | `/api/generate/confirm` | Confirm and save test cases |
| GET | `/api/requirements/{req_id}` | Fetch requirement details |
| POST | `/api/requirements/{req_id}/review` | Review and approve requirement |
| GET | `/api/testcases/{req_id}` | Fetch test cases for requirement |
| POST | `/api/export/testcases` | Export test cases |

## Key Code Patterns

### Database Operations

```python
# Session management
from src.db import get_session
from src.models import Requirement

sess = get_session()
try:
    req = sess.get(Requirement, req_id)
    # or use select queries
    stmt = select(Requirement).where(Requirement.doc_id == doc_id)
    reqs = sess.exec(stmt).all()
finally:
    sess.close()
```

### LLM Calls

- Extraction uses Vertex AI directly via `genai.Client(vertexai=True)`
- Project/location configured in environment: `GENAI_PROJECT`, `GENAI_LOCATION`
- Model selection via `GENAI_MODEL` env var
- JSON parsing and validation via Pydantic models

### Prompt Templates

Located in `src/services/prompts/`:
- `extraction_prompt_v1.txt` / `extraction_prompt_v2.txt`: For requirement extraction
- `judge_prompt_v1.txt`: For test case evaluation

## Important Implementation Details

### Confidence Scoring

- Field-level confidence: Returned by extraction LLM for each field
- Overall requirement confidence: Average of field-level scores
- Used for sorting and filtering requirements by quality

### Test Case Types

- **Positive**: Happy path / normal operation
- **Negative**: Error conditions / constraint violations
- **Boundary**: Edge cases and limit conditions

Prompts are dynamically built with type-specific instructions in `build_generation_prompt()`.

### Status Workflows

**Requirement**: `extracted` → `in_review` → `approved` | `needs_author`
**TestCase**: `preview` → `generated` → `pushed` (with `stale` for regeneration needs)

### Audit Trails

- GenerationEvent: Captures model name, prompt, raw response, and produced test case IDs
- ReviewEvent: Tracks reviewer diffs, confidence, and action taken
- All timestamps in UTC via `now_utc()` helper

## Common Development Tasks

### Running the Backend Locally

```bash
# Start development server
uvicorn app:app --reload

# The app will auto-create tables on startup via SQLModel metadata
```

### Adding a New Endpoint

1. Create router file in `src/routers/`
2. Use SQLModel for database models
3. Leverage Pydantic for request/response validation
4. Register in `app.py` via `app.include_router()`

### Testing LLM Integration

- Model responses are JSON; use Pydantic to validate schema
- Extraction returns dict with keys: `structured`, `field_confidences`, `overall_confidence`, `error`
- Generation returns dict with: `gherkin`, `evidence`, `automated_steps`, `sample_data`, `code_scaffold`
- Judge returns JudgeVerdict Pydantic model with scores and feedback

### Database Migrations

- No migration tool currently in use; schema changes via SQLModel model edits
- Tables created on app startup via `SQLModel.metadata.create_all(engine)` in lifespan

## Debugging Tips

- FastAPI auto-docs: Visit `/docs` for Swagger UI
- Set `echo=True` in `src/db.py` for SQL query logging
- Log levels: extraction.py uses DEBUG level; check logs for detailed LLM responses
- Check GenerationEvent and ReviewEvent tables for audit trails of LLM calls and human decisions
