# Backend Architecture Analysis Report
## Healthcare AI Test Case Generator - Complete Backend Inspection

**Analysis Date**: November 2, 2025  
**Current Branch**: `judge-llm-integration`  
**Status**: Live integration of LLM-as-Judge evaluation system  

---

## 1. OVERALL BACKEND ARCHITECTURE

### Technology Stack
| Component | Tech | Version |
|-----------|------|---------|
| Framework | FastAPI | 0.115.12 |
| ORM | SQLModel | 0.0.24 |
| Database (Dev) | SQLite | (file-based) |
| Database (Prod) | PostgreSQL | (via DATABASE_URL env var) |
| LLM Client | google-genai | (Gemini 2.5 Flash/Pro) |
| Document Parsing | PyPDF2, pandas, openpyxl | multi-format |
| Task Retry | tenacity | 9.1.2 |
| JIRA Integration | jira | 3.10.5 |

### Core Services Layer
All business logic is segregated into `/src/services/`:
- **`extraction.py`**: Requirement extraction via Vertex AI (DEPRECATED - use gemini_client)
- **`gemini_client.py`**: Modern GeminiClient for structured responses + LLM-as-Judge
- **`jira_client.py`**: JIRA API integration
- **`embeddings.py`**: Vector embeddings for RAG knowledge base
- **`document_parser.py`**: Multi-format text extraction (PDF, Excel, CSV, plaintext)

### Router Architecture (12 Routers)
All routers are mounted in `app.py` with `/api` prefix and organized by workflow phase:

| Router | Purpose | Key Endpoints |
|--------|---------|----------------|
| `pipeline_router` | Unified orchestration | `/pipeline/start`, `/pipeline/status`, `/pipeline/auto-approve` |
| `files_router` | Document upload | `/upload`, `/documents` |
| `extraction_router` | Requirement extraction | `/extract/{doc_id}` |
| `generate_router` | Test case generation | `/generate/preview`, `/generate/confirm`, `/generate/regenerate*` |
| `judge_router` | LLM-as-Judge evaluation | `/judge/evaluate`, `/judge/evaluate-batch`, `/judge/scores/*` |
| `human_review_router` | Human QA decisions | `/review/package/*`, `/review/decide`, `/review/batch-decide`, `/review/pending-approval`, `/review/audit-trail` |
| `review_router` | Requirement review | `/review/{req_id}` |
| `rag_router` | Vector embeddings | `/rag/embed`, `/rag/search`, `/rag/status/*` |
| `export_router` | JIRA/CSV export | `/export/jira`, `/export/traceability_matrix`, `/export/testcases/download` |
| `testcases_router` | Test case retrieval | `/testcases` (with filtering) |
| `requirements_router` | Requirement CRUD | `/requirements`, `/requirements/{req_id}`, `/requirements/{req_id}` (PUT) |

---

## 2. DATA MODELS (5 Core Models)

All models use SQLModel (ORM + Pydantic):

### Model 1: Document
```python
class Document:
    id: Optional[int]  # Primary key
    filename: str      # Uploaded filename
    uploaded_by: Optional[str]  # User email
    uploaded_at: datetime  # UTC timestamp
    version: int = 1
    upload_session_id: str  # Versioning/grouping
```

### Model 2: Requirement
```python
class Requirement:
    id: Optional[int]  # Primary key
    doc_id: int        # FK to Document
    requirement_id: Optional[str]  # e.g., "REQ-AL-045"
    raw_text: str      # Original text
    structured: Optional[str]  # JSON string of parsed requirement
    field_confidences: Optional[str]  # JSON { field: confidence_score }
    overall_confidence: float  # 0-1 range
    status: str  # "extracted" | "in_review" | "approved" | "needs_author" | "archived"
    created_at, updated_at: datetime
    version: int = 1
    error_message: Optional[str]
    embeddings_json: Optional[str]  # [UNUSED] For RAG storage
```

**Status Flow**: extracted → in_review/approved/needs_author → used for generation

### Model 3: TestCase
```python
class TestCase:
    id: Optional[int]  # Primary key
    requirement_id: int  # FK to Requirement
    test_case_id: str    # Human-readable ID
    gherkin: Optional[str]  # Gherkin syntax (Given-When-Then)
    evidence_json: Optional[str]  # JSON list of evidence items
    automated_steps_json: Optional[str]  # JSON list of test steps
    sample_data_json: Optional[str]  # JSON test data
    code_scaffold_str: Optional[str]  # Generated code template
    generated_at: datetime
    status: str  # "preview" | "generated" | "stale" | "rejected" | "pushed"
    jira_issue_key: Optional[str]  # JIRA issue ID when pushed
    test_type: str  # "positive" | "negative" | "boundary"
    regeneration_count: int  # How many times regenerated
```

**Status Flow**: preview → generated → (human review) → pushed (to JIRA)

### Model 4: ReviewEvent (Audit Trail)
```python
class ReviewEvent:
    id: Optional[int]
    requirement_id: int  # FK to Requirement
    reviewer: str        # "judge-llm", "human-qa", "dev-user@example.com"
    action: str          # "edit_and_review", "approved", "rejected", "judge_evaluation", "request_regeneration"
    note: Optional[str]  # Human-readable note/feedback
    diffs: Optional[str] # JSON diff of changes
    reviewer_confidence: Optional[float]  # 0-1 range
    timestamp: datetime
```

### Model 5: GenerationEvent (Audit Trail)
```python
class GenerationEvent:
    id: Optional[int]
    requirement_id: Optional[int]  # FK to Requirement
    generated_by: str              # "gemini-extraction", "gemini-generation", "user-confirm"
    model_name: Optional[str]      # e.g., "gemini-2.5-flash-lite"
    prompt: Optional[str]          # Full prompt sent to LLM
    raw_response: Optional[str]    # Full LLM response (JSON)
    produced_testcase_ids: Optional[str]  # JSON list [id1, id2, ...]
    reviewer_confidence: Optional[float]
    timestamp: datetime
```

---

## 3. ENDPOINT ANALYSIS BY ROUTER

### 3.1 PIPELINE ROUTER (`/api/pipeline/*`)
**Purpose**: Unified end-to-end orchestration

#### POST `/api/pipeline/start` ⭐ CRITICAL
**Request**: 
- File upload (multipart form-data)
- Optional `upload_session_id` (for grouping)
- Optional `test_types` (JSON string, default: `["positive","negative","boundary"]`)

**Workflow**:
1. Save file to `./uploads/` with timestamp-based naming
2. Create Document record with `upload_session_id`
3. Extract text from file (via `document_parser.extract_text_from_file`)
4. Split into paragraphs
5. For each paragraph:
   - Call `call_vertex_extraction(text)` (DEPRECATED! Uses old Vertex AI SDK)
   - Create Requirement record with status="extracted"
   - Store confidence scores in field_confidences JSON

**Response**:
```json
{
  "upload_session_id": "uuid",
  "doc_id": 123,
  "requirements_created": 5,
  "message": "..."
}
```

**ISSUES FOUND**:
- ⚠️ Uses `call_vertex_extraction()` which is **DEPRECATED** per code comments
- Should use `GeminiClient.generate_structured_response()` instead
- Sets test_types parameter but doesn't use it in response (only for later /generate/preview call)

#### GET `/api/pipeline/status/{upload_session_id}`
Returns progress tracking:
- Document metadata
- Requirement counts (extracted, embedded, approved)
- Test case counts (generated, pushed)
- Overall stage ("upload" | "extract" | "embed" | "review" | "generate" | "push")
- Progress percentage (0-100)

#### POST `/api/pipeline/auto-approve/{upload_session_id}`
Auto-approves all requirements above confidence threshold (default 0.7)

---

### 3.2 FILES ROUTER (`/api/upload`)

#### POST `/api/upload`
Uploads a single document (standalone, not part of pipeline).

**Request**: 
- File upload (multipart form-data)
- Optional `upload_session_id`

**Response**:
```json
{
  "doc_id": 123,
  "filename": "1730556789_requirements.pdf",
  "upload_session_id": "generated-or-provided"
}
```

#### GET `/api/documents`
Lists documents with optional filtering.

---

### 3.3 EXTRACTION ROUTER (`/api/extract/*`)

#### POST `/api/extract/{doc_id}` ⭐ CRITICAL
**Purpose**: Extract requirements from already-uploaded document

**Request Parameters**:
- `doc_id` (path parameter, int)
- `upload_session_id` (query parameter, optional)

**Workflow**:
1. Fetch Document from database
2. Validate upload_session_id matches (if provided)
3. Load file from filesystem
4. Extract text
5. Split into paragraphs
6. For EACH paragraph:
   - Call `evaluator.build_prompt("extraction_prompt_v2.txt", paragraph)`
   - Call `evaluator.generate_structured_response(prompt, response_schema=None)`
   - Parse JSON response
   - Create Requirement record with status="extracted"
   - Calculate overall_confidence as average of field_confidences
   - Create GenerationEvent for audit trail

**Response**:
```json
{
  "created_requirements": [
    {
      "id": 123,
      "requirement_id": "REQ-AL-045",
      "raw_text": "If SpO₂ < 88%..."
    }
  ]
}
```

**Key Details**:
- Uses GeminiClient (NEW method, not Vertex AI)
- Expects JSON response from Gemini with structure:
  ```json
  {
    "requirement_id": "REQ-AL-045",
    "type": "functional",
    "subject": "SpO₂ alert",
    "trigger": { "metric": "SpO₂", "operator": "<", "value": 88 },
    "actions": ["alert clinician", "log event"],
    "timing_ms": 2000,
    "numbers_units": ["88 (%)", "2 (seconds)"],
    "field_confidences": {
      "requirement_id": 0.95,
      "trigger": 0.87,
      ...
    }
  }
  ```
- Sets confidence threshold for status: if overall_confidence < 0.7, considered "extracted" (not needs_manual_fix)

---

### 3.4 GENERATE ROUTER (`/api/generate/*`) ⭐ CRITICAL

#### POST `/api/generate/preview`
**Purpose**: Generate test case PREVIEWS (not yet confirmed)

**Request**:
```json
{
  "doc_id": 123,
  "test_types": ["positive", "negative", "boundary"]
}
```

**Workflow**:
1. Query Requirement records with status="approved" for doc_id
2. For each test_type AND each requirement:
   - Build generation prompt (with test_type-specific instructions)
   - Call `client.generate_structured_response(prompt, response_schema=None)`
   - Parse JSON response
   - Create TestCase with status="preview"
   - Create GenerationEvent for audit trail

**Response**:
```json
{
  "preview_count": 9,  // 3 types × 3 requirements
  "previews": [
    {
      "id": 456,
      "test_case_id": "TC-REQ-AL-045-1730556789",
      "requirement_id": 123,
      "test_type": "positive",
      "status": "preview",
      "gherkin": "Given SpO₂ = 90...",
      "evidence_json": "[...]",
      ...
    }
  ]
}
```

**Generated Test Case Schema** (from Gemini):
```json
{
  "gherkin": "Given...",
  "evidence": [{ "type": "log", "field": "..." }],
  "automated_steps": ["Step 1", "Step 2"],
  "sample_data": { "SpO₂": 85 },
  "code_scaffold": "def test_spo2_alert():"
}
```

**⚠️ CRITICAL ISSUE**: 
- Only processes requirements with status="approved"
- But there's no endpoint to APPROVE requirements!
- Frontend should call `/api/review/{req_id}` with approval action

#### POST `/api/generate/confirm`
**Request**:
```json
{
  "preview_ids": [456, 457, 458],
  "reviewer_confidence": 0.95
}
```

Transitions test cases from "preview" → "generated" status.

#### POST `/api/generate/regenerate/{preview_id}`
Regenerates a single test case preview, keeping its ID but updating content.

#### POST `/api/generate/regenerate-batch`
Batch regeneration of multiple previews.

---

### 3.5 JUDGE ROUTER (`/api/judge/*`) ⭐ CRITICAL (LLM-as-Judge)

#### POST `/api/judge/evaluate`
**Purpose**: Evaluate a SINGLE test case with judge LLM

**Request**:
```json
{
  "test_case_id": 456,
  "requirement_id": 123,  // Optional
  "judge_model": "gemini-2.5-pro"  // Optional override
}
```

**Workflow**:
1. Fetch TestCase and Requirement
2. Build judge input with requirement + test case details
3. Call judge_client.build_judge_prompt("judge_prompt_v1.txt", ...)
4. Call judge_client.generate_structured_response(prompt, response_schema=JudgeVerdict)
5. Create ReviewEvent for audit trail
6. Return evaluation result

**Response** (JudgeEvaluationResponse):
```json
{
  "test_case_id": 456,
  "feedback": "Good test case with proper Gherkin syntax",
  "evaluation": "This test adequately covers the requirement",
  "total_rating": 3,  // 1-4 scale
  "correctness_of_trigger": 0.85,
  "timing_and_latency": 0.75,
  "actions_and_priority": 0.9,
  "logging_and_traceability": 0.8,
  "standards_citations": 0.6,
  "boundary_readiness": 0.85,
  "consistency_and_no_hallucination": 0.95,
  "confidence_and_warnings": 0.7,
  "evaluated_at": "2025-11-02T..."
}
```

#### POST `/api/judge/evaluate-batch`
Evaluates multiple test cases, skipping failures but continuing batch.

#### GET `/api/judge/scores/{test_case_id}`
Retrieves cached judge evaluation scores from ReviewEvent table.

**⭐ VITAL**: Judge evaluation uses `JudgeVerdict` Pydantic model with 8 rubric dimensions!

---

### 3.6 HUMAN REVIEW ROUTER (`/api/review/*`) ⭐ CRITICAL

#### GET `/api/review/package/{test_case_id}`
**Purpose**: Get complete review package (test case + requirement + judge verdict)

**Response** (TestCaseReviewPackage):
```json
{
  "test_case_id": 456,
  "test_case": {
    "id": 456,
    "test_case_id": "TC-REQ-AL-045-...",
    "test_type": "positive",
    "status": "preview",
    "gherkin": "...",
    "evidence": [...],
    "automated_steps": [...],
    "sample_data": {...},
    "code_scaffold": "...",
    "generated_at": "..."
  },
  "requirement": {
    "id": 123,
    "requirement_id": "REQ-AL-045",
    "raw_text": "If SpO₂ < 88%...",
    "structured": {...},
    "overall_confidence": 0.85,
    "status": "approved"
  },
  "judge_verdict": {
    "feedback": "...",
    "confidence": 0.8,
    "evaluated_at": "..."
  }
}
```

#### POST `/api/review/decide`
**Purpose**: Record human QA decision on test case

**Request** (HumanReviewDecision):
```json
{
  "test_case_id": 456,
  "decision": "approve" | "reject" | "regenerate",
  "notes": "Optional notes",
  "edits": { "gherkin": "Updated Gherkin..." },  // Optional
  "regenerate_reason": "Boundary cases missing"  // For regenerate decision
}
```

**Responses**:
- "approve" → status="generated" (ready to push to JIRA)
- "reject" → status="rejected"
- "regenerate" → status="stale", regeneration_count++

#### POST `/api/review/batch-decide`
Batch version of above endpoint.

#### GET `/api/review/pending-approval`
Lists test cases in "preview" or "stale" status waiting for human approval.

#### GET `/api/review/audit-trail/{test_case_id}`
Shows complete history of decisions and edits for a test case.

---

### 3.7 REVIEW ROUTER (`/api/review/{req_id}`) (Legacy)

#### POST `/api/review/{req_id}`
**Purpose**: Review and approve/edit a REQUIREMENT (not test case)

**Request**:
```json
{
  "reviewer": "user@example.com",
  "edits": { "subject": "Updated subject", "trigger": {...} },
  "review_confidence": 0.9,
  "note": "Minor adjustments made"
}
```

**Workflow**:
1. Load Requirement
2. Apply edits to structured JSON
3. Update field_confidences based on review_confidence
4. Set status = "approved" if review_confidence >= 0.7 else "needs_second_review"
5. Mark all associated TestCases as "stale" (since requirement changed)
6. Create ReviewEvent for audit trail

**Response**:
```json
{
  "req_id": 123,
  "status": "approved",
  "diffs": { "subject": { "old": "...", "new": "..." } },
  "field_confidences": {...}
}
```

---

### 3.8 RAG ROUTER (`/api/rag/*`)

#### POST `/api/rag/embed`
Generates embeddings for all requirements in a document.

**Request**:
```json
{
  "doc_id": 123,
  "chunk_size": 500
}
```

Stores embeddings as JSON in `requirement.embeddings_json`.

#### POST `/api/rag/search`
Semantic search over embedded requirements.

#### GET `/api/rag/status/{doc_id}`
Shows embedding status (% of requirements embedded).

---

### 3.9 EXPORT ROUTER (`/api/export/*`) ⭐ JIRA Integration

#### POST `/api/export/jira`
**Purpose**: Push test cases to JIRA as issues

**Request**:
```
POST /api/export/jira?test_case_ids=456&test_case_ids=457&test_case_ids=458
```

**Workflow**:
1. Fetch test cases and requirements
2. Build JIRA-compatible payload
3. Call `create_jira_issues_from_testcases(jira_config, payload)`
4. Update test cases: status="pushed", jira_issue_key=issue_key
5. Create GenerationEvent

**Response**:
```json
{
  "message": "Successfully pushed to JIRA",
  "created_count": 3,
  "issue_keys": ["TCG-123", "TCG-124", "TCG-125"],
  "failed_count": 0,
  "failed_ids": []
}
```

**⚠️ JIRA Config Required**:
- `JIRA_BASE_URL_PRAJNA`
- `JIRA_API_USER_PRAJNA`
- `JIRA_API_TOKEN_PRAJNA`
- `JIRA_PROJECT_KEY` (default: "TCG")
- `JIRA_ISSUE_TYPE` (default: "Test")

#### GET `/api/export/traceability_matrix`
Exports requirements-to-test-cases mapping as CSV.

#### GET `/api/export/testcases/download`
Exports generated test cases as CSV.

---

### 3.10 TESTCASES ROUTER (`/api/testcases`)

#### GET `/api/testcases`
Lists test cases with filtering by upload_session_id, doc_id, or status.

---

### 3.11 REQUIREMENTS ROUTER (`/api/requirements/*`)

#### GET `/api/requirements`
Lists requirements for a document (excluding archived).

#### GET `/api/requirements/{req_id}`
Gets single requirement details.

#### PUT `/api/requirements/{req_id}`
Updates raw_text and re-extracts requirement:
1. Archives old requirement
2. Marks associated test cases as "stale"
3. Creates new requirement with updated text
4. Calls `call_vertex_extraction()` for new extraction

---

## 4. CRITICAL FINDINGS & VITAL CHANGES

### 4.1 DEPRECATED CODE PATH STILL IN USE
**SEVERITY**: HIGH

The `/api/pipeline/start` endpoint still uses **deprecated** `call_vertex_extraction()`:

```python
# From pipeline_router.py, line 79:
result = call_vertex_extraction(p)  # ⚠️ DEPRECATED!
```

But the file's docstring says:
```python
# ⚠️ DEPRECATED: Use src/services/gemini_client.py:GeminiClient instead
# This function uses the old Vertex AI SDK...
```

**Impact**: 
- `/api/extract/{doc_id}` uses the NEW GeminiClient ✅
- `/api/pipeline/start` uses the OLD Vertex AI SDK ⚠️
- Different extraction APIs mean potential response format mismatches

**Recommendation**: Update pipeline_router to use GeminiClient.

---

### 4.2 REQUIREMENT APPROVAL FLOW MISSING
**SEVERITY**: MEDIUM

The frontend workflow has a "Review Requirements" node, but there's a **gap**:
- `/api/generate/preview` only accepts requirements with status="approved"
- But the only way to set status="approved" is via `/api/review/{req_id}` (legacy, requirement-focused)
- There's NO endpoint to bulk-approve requirements before generation

**Current Flow**:
1. Upload → Extract (creates status="extracted")
2. Manual /api/review/{req_id} call needed to set status="approved"
3. Then /api/generate/preview can proceed

**Recommendation**: Consider if frontend should call `/api/review/{req_id}` or if pipeline should auto-approve high-confidence requirements.

---

### 4.3 TEST CASE STATUS WORKFLOW INCONSISTENCY
**SEVERITY**: MEDIUM

Test case statuses are defined but not fully used:

```python
status: str  # "preview" | "generated" | "stale" | "rejected" | "pushed"
```

But:
- "stale" is set when requirement is edited, but no endpoint re-processes stale test cases
- "rejected" is set by human decision, but no UI to handle it downstream
- "preview" → "generated" is manual (via /api/generate/confirm)

The workflow expects continuous reprocessing of stale cases, which isn't automated.

---

### 4.4 LLM-as-JUDGE INTEGRATION (NEW!)
**SEVERITY**: CRITICAL/FEATURE

The judge_router.py implements a sophisticated 8-dimensional rubric evaluation:

```python
class JudgeVerdict(BaseModel):
    feedback: str
    evaluation: str
    total_rating: int = Field(ge=1, le=4)
    correctness_of_trigger: Optional[float]
    timing_and_latency: Optional[float]
    actions_and_priority: Optional[float]
    logging_and_traceability: Optional[float]
    standards_citations: Optional[float]
    boundary_readiness: Optional[float]
    consistency_and_no_hallucination: Optional[float]
    confidence_and_warnings: Optional[float]
```

**Vital Changes**:
- Judge evaluation is NOW mandatory in workflow (node-5-judge in workflowConfig.ts)
- Uses `gemini-2.5-pro` model (higher capability than extraction's `gemini-2.5-flash-lite`)
- Results stored in ReviewEvent table for audit trail
- Frontend receives detailed rubric scores for each dimension

---

### 4.5 GEMINI CLIENT EVOLUTION
**SEVERITY**: MODERATE

`gemini_client.py` has evolved to use `google-genai` library with:
- Structured response mode via `response_schema` parameter
- Both Pydantic validation (when schema provided) and raw JSON parsing
- Support for custom prompt templates from filesystem

Methods:
- `build_prompt(template_filepath, test_content)` - template injection
- `build_judge_prompt(template_filepath, question, answer)` - QA verification prompts
- `generate_structured_response(contents, response_schema)` - main LLM call

---

### 4.6 MISSING EXTRACTION SCHEMA VALIDATION
**SEVERITY**: LOW

The extraction endpoint doesn't enforce response schema:

```python
response_json_str = evaluator.generate_structured_response(
    prompt,
    response_schema=None  # ⚠️ No schema!
)
```

This means Gemini returns ANY JSON, which is then parsed manually:

```python
result = json.loads(response_json_str)
structured = result if isinstance(result, dict) else {}
```

If Gemini returns a list or other structure, it still passes! Should use `response_schema=ExtractionResponse` for validation.

---

### 4.7 CONFIDENCE SCORING LOGIC
**SEVERITY**: LOW

Confidence scores are calculated differently in different places:

**In extraction_router.py**:
```python
vals = [float(v) for v in fc_map.values() if isinstance(v, (int, float))]
overall_confidence = float(sum(vals) / len(vals)) if vals else 0.7
```

**In pipeline_router.py**:
```python
overall_confidence = float(sum(vals) / len(vals)) if vals else 0.5  # Different default!
```

**Default differs**: 0.7 vs 0.5. Should be consistent.

---

## 5. FRONTEND-BACKEND MISMATCH ANALYSIS

### 5.1 Workflow Node → API Endpoint Mapping

| Frontend Node | Expected API | Actual API | Status |
|---------------|--------------|-----------|--------|
| Upload Requirements | POST /upload | POST /api/upload | ✅ Match |
| Extract | POST /extract | POST /api/extract/{doc_id} | ⚠️ Need doc_id |
| Review Requirements | POST /review | POST /api/review/{req_id} | ✅ Match (but legacy) |
| Generate | POST /generate/preview | POST /api/generate/preview | ✅ Match |
| Judge LLM | POST /judge/evaluate-batch | POST /api/judge/evaluate-batch | ✅ Match |
| Approve Tests | (no API defined) | (manual test case selection) | ⚠️ Manual UI |
| Export | POST /export/jira | POST /api/export/jira | ✅ Match |

### 5.2 Response Format Expectations

The frontend workflow in `App.tsx` processes node outputs, but the specific expected response shapes are not fully validated. Potential mismatches:

1. **Extract Node**: Expects `{ created_requirements: [...] }` but processes doc_id
2. **Generate Node**: Expects `{ preview_count, previews: [...] }` but needs to select for confirm
3. **Judge Node**: Expects `{ evaluations: [...] }` with batch response format

---

## 6. ENVIRONMENT CONFIGURATION

### Required Backend Environment Variables

```bash
# LLM Configuration
GEMINI_API_KEY=your_api_key
GENAI_MODEL=gemini-2.5-flash-lite  # Extraction model
JUDGE_MODEL=gemini-2.5-pro          # Judge model

# Database
DATABASE_URL=sqlite:///data.db  # Dev
# or
DATABASE_URL=postgresql://user:pass@host:5432/dbname  # Prod

# File Upload
UPLOAD_DIR=./uploads  # Storage location

# JIRA Integration
JIRA_BASE_URL_PRAJNA=https://jira.company.com
JIRA_API_USER_PRAJNA=api_user
JIRA_API_TOKEN_PRAJNA=api_token
JIRA_PROJECT_KEY=TCG
JIRA_ISSUE_TYPE=Test

# Legacy (deprecated)
GENAI_PROJECT=vertex_project  # For old call_vertex_extraction
GENAI_LOCATION=global
```

---

## 7. KNOWN LIMITATIONS

1. **No Multi-Tenancy**: All users treated as "dev-user@example.com"
2. **No Rate Limiting**: API endpoints unprotected
3. **No Caching**: All state in database
4. **No Logging**: Limited observability
5. **Single Database**: SQLite in dev, must migrate schema manually
6. **Blocking Architecture**: Sequential processing, no async generation
7. **Test Coverage**: No visible unit/integration tests

---

## 8. SUMMARY TABLE: CRITICAL ENDPOINTS

| Endpoint | Method | Key Request | Key Response | Risk |
|----------|--------|-------------|--------------|------|
| /pipeline/start | POST | file, session_id | doc_id, requirements_created | HIGH: Uses deprecated extraction |
| /extract/{doc_id} | POST | doc_id | created_requirements | MEDIUM: No response schema |
| /generate/preview | POST | doc_id, test_types | preview_count, previews | MEDIUM: Requires approved requirements |
| /judge/evaluate-batch | POST | test_case_ids | evaluations | LOW: Well-structured |
| /review/decide | POST | test_case_id, decision | status, message | MEDIUM: Missing stale case handling |
| /export/jira | POST | test_case_ids | issue_keys, created_count | MEDIUM: Requires JIRA config |
| /review/{req_id} | POST | edits, confidence | status, diffs | MEDIUM: Marks test cases stale |

---

## CONCLUSION

The backend is **well-structured** with clear separation of concerns (routers, services, models) and comprehensive audit trails. However, there are **3 critical issues** that should be addressed:

1. **Deprecated extraction path** still in use (pipeline_router)
2. **Missing requirement approval flow** (no bulk-approve endpoint)
3. **Inconsistent confidence scoring** defaults

The LLM-as-Judge integration is sophisticated and represents a vital new feature for this branch.

