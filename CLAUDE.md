# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Test Case Generator for Healthcare Compliance** - A full-stack application that automates test case generation from requirements documents using Google Vertex AI (Gemini models). The system enables FDA & IEC-62304 compliance workflows through:

1. **Backend** (FastAPI + SQLModel): LLM-powered requirement extraction, test case generation, quality evaluation, and JIRA integration
2. **Frontend** (React + TypeScript + Vite): Visual workflow canvas with pre-embedded healthcare testing pipeline, optional feature toggles, and real-time metrics dashboard

The system is built for healthcare/medical device compliance but generalizes to any domain requiring structured test case generation from natural language requirements.

---

## Quick Start Commands

### Backend Setup & Development

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Development with auto-reload
cd backend && uvicorn app:app --reload

# Production (with Gunicorn)
gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker

# Environment configuration
# Copy .env.example to .env and set:
#   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
#   GCP_PROJECT=your-gcp-project-id
#   GENAI_MODEL=gemini-2.5-flash-lite
#   DATABASE_URL=sqlite:///data.db  (or PostgreSQL for prod)
```

Backend runs on `http://localhost:8000` with API docs at `/docs`

### Frontend Setup & Development

```bash
# Install dependencies
npm install  # from frontend/

# Development server with hot reload
npm run dev  # runs on http://localhost:5173

# Production build
npm run build

# Preview production build locally
npm run serve

# Environment configuration
# Copy .env.example to .env and set:
#   VITE_API_BASE=http://localhost:8000/api
```

Frontend runs on `http://localhost:5173`

---

## Architecture & Design Decisions

### 1. Full-Stack Data Flow

```
User Upload (Frontend)
    ↓
POST /api/pipeline/start (Backend Unified Orchestration)
    ↓
[Document Created & Text Extracted]
    ↓
[Vertex AI Requirement Extraction - Per Paragraph]
    ↓
[Vector Embeddings for RAG Knowledge Base]
    ↓
User Toggles Optional Features in Frontend
    ↓
[Generate Test Cases - Multiple Types]
    ↓
[Optional: LLM-as-Judge Quality Evaluation]
    ↓
User Reviews & Approves (Human-in-Loop)
    ↓
[Export to JIRA/External Systems]
    ↓
[TestCase Status = "pushed"]
```

### 2. Backend Architecture: Service-Oriented with Audit Trail

**File Structure**:
- `app.py`: FastAPI entry point, router registration, lifespan setup, CORS middleware
- `src/db.py`: SQLModel engine configuration (SQLite dev / PostgreSQL prod)
- `src/models.py`: 5 core database models (Document, Requirement, TestCase, ReviewEvent, GenerationEvent)
- `src/routers/`: 10 endpoint routers organized by workflow phase (files, extraction, generation, judge, human_review, export, pipeline, etc.)
- `src/services/`: Business logic (extraction.py, gemini_client.py, jira_client.py, embeddings.py, document_parser.py)
- `src/services/prompts/`: External LLM prompt templates (extraction_prompt_v1.txt, judge_prompt_v1.txt, etc.)

**Core Services**:
- **`extraction.py`**: Vertex AI-powered requirement structuring with Pydantic validation, retry logic via `tenacity`
- **`gemini_client.py`**: LLM-as-Judge implementation for test quality scoring (correctness, timing, actions, standards, boundary readiness, consistency)
- **`jira_client.py`**: JIRA API integration for pushing test cases to external systems
- **`embeddings.py`**: Vector embeddings for RAG (Retrieval Augmented Generation) knowledge base search
- **`document_parser.py`**: Multi-format text extraction (PDF via PyPDF2, Excel via openpyxl, CSV via pandas, plain text)

**Database Models** with Status Tracking:
- **Document**: Uploaded file metadata (filename, upload_session_id for versioning)
- **Requirement**: Extracted requirement (raw_text, structured JSON, field_confidences, overall_confidence, status)
- **TestCase**: Generated test case (gherkin, evidence, automated_steps, sample_data, code_scaffold, test_type)
- **ReviewEvent**: Audit trail for requirement reviews (reviewer, action, diffs, confidence)
- **GenerationEvent**: Audit trail for LLM calls (model, prompt, raw response, produced test case IDs)

**Key Design Pattern - Unified Pipeline**: A single `/api/pipeline/start` endpoint orchestrates the entire backend workflow (upload → extract → embed → generate) in one call. This enables batch processing without requiring frontend choreography.

### 3. Frontend Architecture: Pre-Embedded Workflow with Feature Toggles

**File Structure**:
- `src/main.tsx`: React entry point
- `src/App.tsx`: **Monolithic main component (~1800 LOC)** - Contains entire workflow orchestration, node definitions, and execution engine
- `src/index.css`: Global styles with Tailwind CSS v4 and CSS custom properties
- `src/config/workflowConfig.ts`: **Pre-embedded workflow definition** - 7 nodes, configurable optional features
- `src/components/WorkflowSettings.tsx`: Settings modal for toggling optional features

**Core Pattern - Pre-Embedded Workflow**:
The entire healthcare test case generation workflow is **baked into the frontend** with optional features that can be toggled:

```
Workflow Initialized (7 nodes: Upload, Extract, Standards*, Generate, Judge*, Review, Export)
    ↓
User Opens Settings (⚙️ button)
    ↓
Toggle Features: includeStandards, includeJudge
    ↓
Workflow Auto-Updates (via React useEffect)
    ↓
User Clicks Play ▶️
    ↓
Nodes Execute Sequentially (respecting visible edges)
    ↓
Metrics Dashboard Updates in Real-Time
```

*Optional nodes (marked with *)

**Why Pre-Embedded?** Users don't assemble workflows manually each time. The standard healthcare test generation process is always available with optional enhancements (standards compliance, AI evaluation) togglable on/off.

**Workflow Configuration** (`src/config/workflowConfig.ts`):
- `DEFAULT_WORKFLOW_NODES`: Array of 7 pre-configured nodes with positions and properties
- `DEFAULT_WORKFLOW_EDGES`: Predefined connections between nodes
- `WorkflowConfig` interface: Feature toggles (`includeStandards`, `includeJudge`)
- Helper functions: `getVisibleNodes()`, `getVisibleEdges()`, `buildExecutionSequence()`, `initializeWorkflow()`

**Node Types** (Custom ReactFlow node components in App.tsx):
- **UploadNode**: File upload (requirements & standards documents)
- **ProcessorNode**: Parse documents, generate test cases, embed for RAG
- **ValidatorNode**: Quality validation with pass/fail scoring
- **ManualNode**: Human review & approval interface
- **IntegrationNode**: Push results to JIRA/Azure DevOps/TestRail/Polarion

**Workflow Engine** (`runWorkflow()` function):
1. Finds upload node (entry point)
2. Traverses edges to build ordered node queue (skips disabled nodes)
3. Processes each visible node sequentially with 2-second delays
4. Updates UI state (`processing` flag) and metrics dashboard
5. Includes try-catch error handling with user-facing messages

**State Management**: React Hooks only (useState, useCallback, useRef, useMemo, useEffect) - no external state library.

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend Framework** | React 18.3.1 + TypeScript | SPA with hooks only |
| **Frontend Build** | Vite 7.1.5 | Fast bundler + dev server |
| **Frontend Styling** | Tailwind CSS v4.1.16 | Utility-first CSS |
| **Frontend Workflow** | XYFlow 12.9.0 | Visual node-based canvas |
| **Backend Framework** | FastAPI 0.115.12 | Async Python web framework |
| **Backend Server** | Uvicorn 0.35.0 | ASGI server |
| **ORM** | SQLModel 0.0.24 | SQLAlchemy + Pydantic |
| **Database (Dev)** | SQLite | File-based `data.db` |
| **Database (Prod)** | PostgreSQL | Via `DATABASE_URL` env var |
| **LLM API** | Google Vertex AI / Gemini | Via `google-genai` library |
| **Document Parsing** | PyPDF2, pandas, openpyxl | Multi-format support |
| **JIRA Integration** | `jira` library v3.10.5 | Push test cases to JIRA |
| **Retry Logic** | `tenacity` 9.1.2 | Exponential backoff for LLM calls |
| **Cloud Platform** | Google Cloud Platform | Cloud Run, Cloud Storage, Cloud Build |

---

## Important Implementation Details

### Confidence Scoring System

Extraction service returns field-level confidence scores:
- **Field-level**: Per field in structured JSON (0-1 range)
- **Overall requirement**: Average of field-level scores
- **Usage**: Sort/filter requirements by quality, identify low-confidence extractions for review

### Test Case Types & Prompt Building

Generated test cases have types:
- **Positive**: Happy path / normal operation
- **Negative**: Error conditions / constraint violations
- **Boundary**: Edge cases and limit conditions

Prompts in `src/services/prompts/` are injected at runtime with type-specific instructions via `build_generation_prompt()`.

### LLM-as-Judge Pattern

Separate `src/services/gemini_client.py` service implements test quality evaluation:
- Scores generated test cases using rubric (8 dimensions)
- Returns `JudgeVerdict` Pydantic model with scores (1-4 scale) and feedback
- Used to identify low-quality cases for re-generation
- Exposed via `judge_router.py` endpoint

### Audit Trail via Event Sourcing

Healthcare compliance requires complete traceability:
- **GenerationEvent**: Captures model name, prompt template version, raw response, produced test case IDs
- **ReviewEvent**: Tracks reviewer identity, action taken (approved/rejected), diffs, confidence
- All timestamps in UTC via `now_utc()` helper
- Enables full requirement extraction & approval chain audit

### Multi-Format Document Parsing

Unified `document_parser.py` API:
- **PDF**: PyPDF2 (with fallback to Google Document AI)
- **Excel**: openpyxl for .xlsx, pandas for .csv
- **Plain Text**: Direct read
- Files stored in `./uploads/` with timestamp-based naming

### Prompt Templates as External Configuration

Prompts stored in `src/services/prompts/` as `.txt` files:
- Decouples LLM prompts from code
- Allows non-engineers to tweak prompts without code deployment
- Multiple versions (v1, v2) enable A/B testing
- Injected at runtime into service functions

### No Custom Authentication

Current implementation assumes:
- Deployment behind corporate VPN (dev)
- GCP service accounts for Vertex AI API auth (prod)
- **Not suitable for multi-tenant production** - add OAuth2/JWT before enterprise use

---

## API Endpoints Overview

### Backend Routers & Endpoints

| Router | Method | Endpoint | Purpose |
|--------|--------|----------|---------|
| **pipeline** | POST | `/api/pipeline/start` | Unified end-to-end orchestration (upload → extract → embed → generate) |
| **files** | POST | `/api/upload` | Upload requirement document |
| **extraction** | POST | `/api/extract/{doc_id}` | Extract and structure requirements from document |
| **generation** | POST | `/api/generate/preview` | Generate preview test cases (not yet stored) |
| **generation** | POST | `/api/generate/confirm` | Confirm and save test cases to database |
| **judge** | POST | `/api/judge/evaluate-batch` | LLM-as-Judge quality evaluation for test cases |
| **rag** | POST | `/api/rag/embed` | Create vector embeddings for knowledge base search |
| **human_review** | POST | `/api/requirements/{req_id}/review` | Review and approve requirement |
| **export** | POST | `/api/export/testcases` | Export test cases in multiple formats |
| **requirements** | GET | `/api/requirements/{req_id}` | Fetch requirement details |
| **testcases** | GET | `/api/testcases/{req_id}` | Fetch test cases for requirement |

### Frontend API Communication Pattern

Fetch API with environment-based configuration:

```typescript
const BASE_URL = import.meta.env.VITE_API_BASE || '/api';

// Node processing function example:
const response = await fetch(`${BASE_URL}/extract/${documentId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* request payload */ })
});

const data = await response.json();
```

---

## Environment Configuration

### Backend (.env)

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GCP_PROJECT=your-gcp-project-id
GENAI_PROJECT=your-vertex-ai-project-id
GENAI_LOCATION=global
GENAI_MODEL=gemini-2.5-flash-lite
DATABASE_URL=sqlite:///data.db
```

### Frontend (.env)

```
VITE_API_BASE=http://localhost:8000/api
```

---

## Deployment to Google Cloud Platform

The `cloudbuild.yaml` automates GCP deployment:

### Backend (Cloud Run)
1. Build Docker image from `backend/Dockerfile` (Python 3.11 + Uvicorn)
2. Push to Google Container Registry
3. Deploy to Cloud Run (region: us-central1, allow-unauthenticated)
4. Uvicorn listens on port 8080

### Frontend (Cloud Storage)
1. Build React app with Vite (`npm install && npm run build`)
2. Dynamically inject backend URL: `VITE_API_BASE=$(gcloud run services describe...)/api`
3. Sync `dist/` to Cloud Storage bucket
4. Static site served via HTTPS

### Docker Setup

Backend Dockerfile:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## Development Workflow

### Adding a New Backend Endpoint

1. Create router file in `src/routers/` (e.g., `custom_router.py`)
2. Use SQLModel for database models
3. Leverage Pydantic for request/response validation
4. Register in `app.py`: `app.include_router(custom_router.router, prefix="/api", tags=["custom"])`

### Adding a New Frontend Node

1. Define node component function in `App.tsx` (or extract to separate file)
2. Register in `nodeTypes` object in App.tsx
3. Add to `DEFAULT_WORKFLOW_NODES` in `src/config/workflowConfig.ts`
4. Connect via edges in `DEFAULT_WORKFLOW_EDGES`
5. Implement processing logic in `runWorkflow()` function

### Adding a New Optional Feature

1. Add feature toggle to `WorkflowConfig` interface in `workflowConfig.ts` (e.g., `includeRAG: boolean`)
2. Add node with `featureKey` property to `DEFAULT_WORKFLOW_NODES`
3. Add conditional edges in `DEFAULT_WORKFLOW_EDGES`
4. Add toggle checkbox in `src/components/WorkflowSettings.tsx`
5. Test end-to-end: verify node appears/disappears on toggle, workflow executes correctly

### Modifying the Workflow Structure

1. Edit `src/config/workflowConfig.ts` (node positions, add/remove nodes/edges, modify feature logic)
2. Update `App.tsx` if node types or data properties change
3. Test with dev server: `npm run dev`

### Testing LLM Integration

Backend model responses are JSON validated via Pydantic:
- **Extraction** returns: `{ structured, field_confidences, overall_confidence, error }`
- **Generation** returns: `{ gherkin, evidence, automated_steps, sample_data, code_scaffold }`
- **Judge** returns: `JudgeVerdict` with scores (1-4 scale) and feedback

Check `GenerationEvent` and `ReviewEvent` tables for audit trails of LLM calls and human decisions.

---

## Debugging Tips

### Backend

- **FastAPI auto-docs**: Visit `http://localhost:8000/docs` for Swagger UI
- **SQL logging**: Set `echo=True` in `src/db.py` for query logging
- **LLM responses**: Check `GenerationEvent` table for raw responses
- **Error handling**: Try-catch blocks with detailed error messages in services

### Frontend

- **Settings modal not opening**: Check `showSettings` state in header button click
- **Nodes not updating on toggle**: Verify `workflowConfig` state change triggers useEffect
- **Optional nodes not hiding**: Check `featureKey` is set on node in `workflowConfig.ts`
- **Workflow execution skipping nodes**: Verify `buildExecutionSequence()` traverses visible edges
- **API errors**: Verify `VITE_API_BASE` environment variable is set correctly
- **Metrics not updating**: Check `setMetrics()` calls in node processing functions

### End-to-End

- Start backend: `cd backend && uvicorn app:app --reload`
- Start frontend: `cd frontend && npm run dev`
- Check API docs: `http://localhost:8000/docs`
- Check frontend: `http://localhost:5173`
- Monitor network tab for API calls and responses

---

## Known Limitations & Future Improvements

### Current Limitations

1. **No Custom Authentication**: Uses GCP service accounts; not suitable for multi-tenant
2. **Single Cloud Run Instance**: No auto-scaling or load balancing configured
3. **No Database Migrations**: Schema changes via manual model edits (no Alembic/Liquibase)
4. **No Caching**: All state in database; no Redis/Memcache integration
5. **Limited Logging**: No Sentry/Stackdriver monitoring configured
6. **No Rate Limiting**: API endpoints unprotected from abuse
7. **Monolithic Frontend**: ~1800 LOC in App.tsx; should be refactored into smaller components
8. **No React Router**: Single-page app; hard to deep-link to specific workflow states
9. **No Test Coverage**: No visible unit/integration tests in codebase

### Recommended Refactoring

**Frontend**:
- Extract node components to separate files (`components/nodes/UploadNode.tsx`, etc.)
- Create custom hook for workflow execution logic (`hooks/useWorkflowEngine.ts`)
- Separate sidebar and metrics dashboard into standalone components
- Consider state management library (Zustand, Recoil) for larger apps

**Backend**:
- Add OpenTelemetry for distributed tracing
- Implement API rate limiting (FastAPI middleware)
- Set up database migrations (Alembic)
- Add comprehensive unit & integration tests (pytest)
- Implement OAuth2/JWT authentication for multi-tenant use

---

## Key Files Quick Reference

### Backend Core
- `backend/app.py` - FastAPI entry point, router registration
- `backend/src/models.py` - Database models (Document, Requirement, TestCase, ReviewEvent, GenerationEvent)
- `backend/src/db.py` - SQLModel engine configuration
- `backend/src/routers/pipeline_router.py` - Unified end-to-end orchestration
- `backend/src/services/extraction.py` - Requirement structuring logic
- `backend/src/services/gemini_client.py` - LLM-as-Judge implementation
- `backend/cloudbuild.yaml` - GCP deployment configuration

### Frontend Core
- `frontend/src/App.tsx` - Main component with workflow orchestration (~1800 LOC)
- `frontend/src/config/workflowConfig.ts` - Pre-embedded workflow definition
- `frontend/src/components/WorkflowSettings.tsx` - Feature toggle UI
- `frontend/vite.config.ts` - Build configuration (Tailwind + React plugins)
- `frontend/package.json` - Dependencies and npm scripts

---

## Git Workflow Context

**Current Branch**: `judge-llm-integration` - Implementing LLM-as-Judge for test quality evaluation

**Main Branch**: `master` - Production-ready code

**Recent Commits**:
- `87fd9ee`: feat: make the workflow pre embedded
- `2ce31e5`: feat: unified routers and pipelining using existing services
- `3ac57b0`: feat: add document parse common function
- `8bc98eb`: feat: add node workflow for test case generator God Level
