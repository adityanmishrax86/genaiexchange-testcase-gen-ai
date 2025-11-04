# Backend Architecture Complete Analysis
## Healthcare AI Test Case Generator

**Generated**: November 2, 2025  
**Current Branch**: `judge-llm-integration`  
**Analysis Scope**: All 12 backend routers, 5 data models, 35+ endpoints

---

## Quick Reference

### Directory Structure
```
backend/
├── app.py                          # FastAPI entry point, router registration
├── src/
│   ├── db.py                      # SQLModel engine configuration
│   ├── models.py                  # 5 core database models
│   ├── routers/                   # 12 endpoint routers
│   │   ├── pipeline_router.py     # Unified orchestration
│   │   ├── files_router.py        # Document upload
│   │   ├── extraction_router.py   # Requirement extraction
│   │   ├── generate_router.py     # Test case generation
│   │   ├── judge_router.py        # LLM-as-Judge evaluation ⭐ NEW
│   │   ├── human_review_router.py # Test case approval
│   │   ├── review_router.py       # Requirement approval (legacy)
│   │   ├── rag_router.py          # Vector embeddings
│   │   ├── export_router.py       # JIRA/CSV export
│   │   ├── testcases_router.py    # Test case queries
│   │   └── requirements_router.py # Requirement CRUD
│   └── services/                  # Business logic
│       ├── extraction.py          # ⚠️ DEPRECATED Vertex AI extraction
│       ├── gemini_client.py       # ✅ NEW GeminiClient (google-genai)
│       ├── jira_client.py         # JIRA API integration
│       ├── embeddings.py          # Vector embeddings (RAG)
│       └── document_parser.py     # Multi-format text extraction
└── requirements.txt
```

---

## 1. VITAL ARCHITECTURE INSIGHTS

### 1.1 Pre-Embedded Workflow Design
- Frontend workflow is **not** dynamically constructed
- All 7 nodes are **pre-defined and always initialized** in `workflowConfig.ts`
- Optional features (Standards, Judge) can be toggled on/off
- Frontend does NOT make new workflow structure requests
- **Implication**: Backend must support fixed workflow always

### 1.2 Three-Layer Architecture
```
Frontend (React + TypeScript)
    ↓ HTTP Fetch API
Backend (FastAPI)
    ├── Routers (12 files, organizing by concern)
    ├── Services (business logic, LLM calls)
    └── Models (SQLModel ORM + Pydantic)
    ↓ SQL
Database (SQLite dev / PostgreSQL prod)
```

### 1.3 Audit Trail First Design
- **GenerationEvent**: Tracks every LLM call (extraction, generation, confirmation)
- **ReviewEvent**: Tracks every human decision (approval, edits, judge feedback)
- Complete traceability for FDA/IEC-62304 compliance
- All timestamps in UTC via `now_utc()` helper

---

## 2. CRITICAL FINDINGS (Ranked by Severity)

### 🔴 SEVERITY: HIGH

#### Issue #1: Deprecated Extraction Path Still Active
**Location**: `pipeline_router.py:79`  
**Problem**: Uses old `call_vertex_extraction()` (Vertex AI SDK)  
**Correct Path**: `extraction_router.py` uses new `GeminiClient` (google-genai)

**Why it matters**:
- Two different LLM APIs in production
- Different response formats
- Inconsistent error handling
- `/api/pipeline/start` and `/api/extract/{doc_id}` behave differently

**Fix**: Update pipeline_router to use `GeminiClient.generate_structured_response()`

---

### 🟠 SEVERITY: MEDIUM

#### Issue #2: Missing Requirement Approval Workflow
**Problem**:
- Frontend has "Review Requirements" node
- `/api/generate/preview` requires status="approved"
- Only way to set status="approved" is legacy `/api/review/{req_id}`
- No bulk-approve endpoint

**Why it matters**:
- Frontend cannot auto-approve requirements
- Must call `/api/review/{req_id}` manually for each
- Breaks workflow automation

**Fix**: Add `/api/requirements/bulk-approve` endpoint OR ensure frontend calls `/api/review/{req_id}` for each

---

#### Issue #3: Test Case Status Not Fully Handled
**Problem**:
- "stale" status set when requirement edited (marks old test cases stale)
- No auto-regeneration endpoint for stale cases
- "rejected" status set by human but not handled downstream

**Why it matters**:
- Workflow expects regeneration but no mechanism exists
- UI might show rejected cases with no action

**Fix**: Add `/api/generate/regenerate-stale` or implement auto-reprocessing

---

### 🟡 SEVERITY: LOW

#### Issue #4: Inconsistent Confidence Defaults
**Locations**: 
- `extraction_router.py:131` defaults to 0.7
- `pipeline_router.py:86` defaults to 0.5

**Why it matters**: Subtle behavioral differences between endpoints

#### Issue #5: Missing Response Schema Validation
**Location**: `extraction_router.py:81`  
**Problem**: Uses `response_schema=None` instead of `response_schema=ExtractionResponse`

**Why it matters**: Gemini can return unexpected JSON format

---

## 3. THE JUDGE LLM INTEGRATION (NEW!)

### What Changed
The `judge-llm-integration` branch adds sophisticated quality evaluation:

### Judge Router Endpoints
```python
POST /api/judge/evaluate               # Single test case evaluation
POST /api/judge/evaluate-batch         # Multiple test cases
GET /api/judge/scores/{test_case_id}   # Retrieve cached scores
```

### Judge Verdict Rubric (8 Dimensions)
```python
class JudgeVerdict(BaseModel):
    feedback: str                                    # Summary
    evaluation: str                                  # Rationale
    total_rating: int = Field(ge=1, le=4)          # 1-4 scale
    correctness_of_trigger: Optional[float]        # 0-1 normalized
    timing_and_latency: Optional[float]
    actions_and_priority: Optional[float]
    logging_and_traceability: Optional[float]
    standards_citations: Optional[float]
    boundary_readiness: Optional[float]
    consistency_and_no_hallucination: Optional[float]
    confidence_and_warnings: Optional[float]
```

### Model Used
- `gemini-2.5-pro` (higher capability than extraction's `gemini-2.5-flash-lite`)
- Results stored in `ReviewEvent` table for audit trail
- Enables human-in-the-loop with detailed feedback

### Frontend Integration
- Frontend node "node-5-judge" is **mandatory** (not optional in current workflowConfig)
- Receives batch evaluation response with all 8 dimension scores
- Human QA node ("node-6-approve") follows judge for final approval

---

## 4. DATA MODEL REFERENCE

### Model: Document
```python
id: int (PK)
filename: str
uploaded_by: str (optional)
uploaded_at: datetime (UTC)
version: int
upload_session_id: str (UUID for grouping)
```

### Model: Requirement
```python
id: int (PK)
doc_id: int (FK)
requirement_id: str (optional, e.g., "REQ-AL-045")
raw_text: str
structured: str (JSON)
field_confidences: str (JSON map)
overall_confidence: float (0-1)
status: str (extracted|approved|archived|needs_author|in_review)
created_at, updated_at: datetime (UTC)
version: int
error_message: str (optional)
embeddings_json: str (for RAG, optional)
```

### Model: TestCase
```python
id: int (PK)
requirement_id: int (FK)
test_case_id: str (human-readable)
gherkin: str (Given-When-Then)
evidence_json: str (JSON list)
automated_steps_json: str (JSON list)
sample_data_json: str (JSON dict)
code_scaffold_str: str
generated_at: datetime (UTC)
status: str (preview|generated|stale|rejected|pushed)
jira_issue_key: str (optional, after export)
test_type: str (positive|negative|boundary)
regeneration_count: int
```

### Model: ReviewEvent (Audit)
```python
id: int (PK)
requirement_id: int (FK)
reviewer: str (judge-llm|human-qa|email)
action: str (edit_and_review|approved|rejected|judge_evaluation|request_regeneration)
note: str (optional)
diffs: str (JSON optional)
reviewer_confidence: float (0-1 optional)
timestamp: datetime (UTC)
```

### Model: GenerationEvent (Audit)
```python
id: int (PK)
requirement_id: int (FK optional)
generated_by: str (gemini-extraction|gemini-generation|user-confirm)
model_name: str (optional)
prompt: str (optional, full prompt sent)
raw_response: str (optional, raw LLM response)
produced_testcase_ids: str (JSON list optional)
reviewer_confidence: float (optional)
timestamp: datetime (UTC)
```

---

## 5. ENDPOINT MASTER REFERENCE

### Upload & Extract Phase
| Endpoint | Method | Purpose | Key Notes |
|----------|--------|---------|-----------|
| POST /api/pipeline/start | POST | Upload + extract (one-shot) | ⚠️ Uses deprecated extraction |
| POST /api/upload | POST | Upload only | Returns doc_id |
| POST /api/extract/{doc_id} | POST | Extract (separate) | ✅ Uses GeminiClient |

### Approval Phase
| Endpoint | Method | Purpose | Key Notes |
|----------|--------|---------|-----------|
| POST /api/review/{req_id} | POST | Approve requirement | Marks test cases "stale" if edited |
| POST /api/pipeline/auto-approve/{session_id} | POST | Bulk approve | Uses confidence threshold (0.7 default) |

### Generation Phase
| Endpoint | Method | Purpose | Key Notes |
|----------|--------|---------|-----------|
| POST /api/generate/preview | POST | Generate test previews | Only processes status="approved" requirements |
| POST /api/generate/confirm | POST | Confirm previews | Transitions preview→generated |
| POST /api/generate/regenerate/{id} | POST | Regenerate single | Replaces content in-place |
| POST /api/generate/regenerate-batch | POST | Regenerate multiple | Skips failures, continues batch |

### Evaluation Phase
| Endpoint | Method | Purpose | Key Notes |
|----------|--------|---------|-----------|
| POST /api/judge/evaluate | POST | Judge single | 8-dimensional rubric |
| POST /api/judge/evaluate-batch | POST | Judge multiple | Batch processing, skips failures |
| GET /api/judge/scores/{id} | GET | Retrieve cached scores | From ReviewEvent table |

### Review Phase
| Endpoint | Method | Purpose | Key Notes |
|----------|--------|---------|-----------|
| GET /api/review/package/{id} | GET | Get review package | Test case + requirement + judge verdict |
| POST /api/review/decide | POST | Human decision | approve|reject|regenerate |
| POST /api/review/batch-decide | POST | Batch decisions | Multiple test cases |
| GET /api/review/pending-approval | GET | Queue of pending | Filter by doc_id optional |
| GET /api/review/audit-trail/{id} | GET | Complete history | All decisions and edits |

### Query Phase
| Endpoint | Method | Purpose | Key Notes |
|----------|--------|---------|-----------|
| GET /api/testcases | GET | List test cases | Filter by doc_id, session_id, status |
| GET /api/requirements | GET | List requirements | Filter by doc_id, exclude archived |
| GET /api/requirements/{id} | GET | Get requirement detail | Includes structured JSON |
| PUT /api/requirements/{id} | PUT | Update & re-extract | Archives old, creates new version |

### Export Phase
| Endpoint | Method | Purpose | Key Notes |
|----------|--------|---------|-----------|
| POST /api/export/jira | POST | Push to JIRA | Requires JIRA_* env vars |
| GET /api/export/traceability_matrix | GET | Export CSV | Requirement-to-test mapping |
| GET /api/export/testcases/download | GET | Export CSV | Test case details |

### Utilities
| Endpoint | Method | Purpose | Key Notes |
|----------|--------|---------|-----------|
| GET /api/pipeline/status/{session_id} | GET | Progress tracking | Stage, percentage, stats |
| POST /api/rag/embed | POST | Generate embeddings | Vector DB for semantic search |
| POST /api/rag/search | POST | Semantic search | Cosine similarity |
| GET /api/rag/status/{doc_id} | GET | Embedding status | % requirements embedded |
| GET /api/documents | GET | List documents | Optional session filter |

---

## 6. FRONTEND-BACKEND MAPPING

### Workflow Node → API Calls

```
node-1-upload-requirements
  └─→ POST /api/upload
       ├─ Input: file
       └─ Output: doc_id

node-2-extract
  └─→ POST /api/extract/{doc_id}
       ├─ Input: doc_id (from upload)
       └─ Output: created_requirements (list of requirement IDs)

node-3-review
  └─→ (Frontend UI for approval)
      └─→ POST /api/review/{req_id} (for EACH requirement)
           ├─ Input: req_id, edits, review_confidence
           └─ Output: status="approved"

node-4-generate
  ├─→ POST /api/generate/preview
  │    ├─ Input: doc_id, test_types
  │    └─ Output: previews (list of test cases in "preview" status)
  └─→ POST /api/generate/confirm (after human selection)
       ├─ Input: preview_ids
       └─ Output: confirmed count

node-5-judge ⭐
  └─→ POST /api/judge/evaluate-batch
       ├─ Input: test_case_ids
       └─ Output: evaluations with 8-dimensional scores

node-6-approve
  └─→ (Frontend UI for selection)
      └─→ POST /api/review/decide (for EACH test case)
           ├─ Input: test_case_id, decision (approve|reject|regenerate)
           └─ Output: status updated

node-7-export
  └─→ POST /api/export/jira
       ├─ Input: test_case_ids
       └─ Output: issue_keys (created JIRA issues)
```

---

## 7. STATUS STATE MACHINES

### Requirement Status Flow
```
extracted (default after /extract)
    ↓ (call /review/{req_id} with confidence >= 0.7)
approved
    ↓ (used for /generate/preview)
[generates test cases]

Alternative paths:
- needs_author (if extraction fails)
- in_review (intermediate)
- archived (when replaced via PUT /requirements/{id})
```

### Test Case Status Flow
```
preview (after /generate/preview)
    ↓ (call /generate/confirm)
generated
    ↓ (call /review/decide with decision="approve")
[ready for export]
    ↓ (call /export/jira)
pushed (after successful export)
    ↓ (JIRA issue created, jira_issue_key set)
[workflow complete]

Alternative paths:
- stale (when requirement is edited/updated)
- rejected (after /review/decide with decision="reject")
```

---

## 8. CRITICAL ENVIRONMENT VARIABLES

### Absolutely Required
```bash
GEMINI_API_KEY=<api_key>
DATABASE_URL=sqlite:///data.db  # or postgresql://...
```

### Recommended (with defaults)
```bash
GENAI_MODEL=gemini-2.5-flash-lite  # Extraction model
JUDGE_MODEL=gemini-2.5-pro         # Judge model
UPLOAD_DIR=./uploads
```

### For JIRA Integration
```bash
JIRA_BASE_URL_PRAJNA=https://jira.company.com
JIRA_API_USER_PRAJNA=user
JIRA_API_TOKEN_PRAJNA=token
JIRA_PROJECT_KEY=TCG
JIRA_ISSUE_TYPE=Test
```

### Legacy (for old extraction, not recommended)
```bash
GENAI_PROJECT=vertex_project
GENAI_LOCATION=global
```

---

## 9. KEY FILES LOCATION REFERENCE

| Purpose | File Path |
|---------|-----------|
| Data models | `/src/models.py` |
| Requirement extraction (NEW) | `/src/routers/extraction_router.py` |
| Test generation | `/src/routers/generate_router.py` |
| Judge evaluation (NEW) | `/src/routers/judge_router.py` |
| Human review | `/src/routers/human_review_router.py` |
| JIRA export | `/src/routers/export_router.py` |
| Unified pipeline | `/src/routers/pipeline_router.py` |
| GeminiClient (NEW) | `/src/services/gemini_client.py` |
| Old extraction (DEPRECATED) | `/src/services/extraction.py` |
| Prompt templates | `/src/services/prompts/` |
| Frontend workflow config | `frontend/src/config/workflowConfig.ts` |

---

## 10. SUMMARY OF CHANGES (judge-llm-integration branch)

### What's New
1. Judge LLM evaluation router with 8-dimensional rubric
2. Human review router for test case approval decisions
3. Enhanced ReviewEvent model for audit trail
4. GeminiClient for modern google-genai library
5. Pre-embedded workflow in frontend with optional features

### What's Deprecated
1. `call_vertex_extraction()` in extraction.py
2. Old Vertex AI SDK (but still used in pipeline_router)

### What Needs Fixing
1. Unify extraction APIs (remove deprecated path)
2. Implement requirement bulk-approval
3. Add stale test case auto-regeneration
4. Validate response schemas in extraction

---

## 11. PRODUCTION CHECKLIST

Before deploying to production:

- [ ] Update `/api/pipeline/start` to use GeminiClient (not deprecated extraction)
- [ ] Add `/api/requirements/bulk-approve` endpoint or ensure frontend calls /review for each
- [ ] Set consistent confidence defaults (0.7 vs 0.5)
- [ ] Enable response schema validation for extraction
- [ ] Configure all JIRA_* environment variables
- [ ] Set DATABASE_URL to PostgreSQL
- [ ] Test all 35+ endpoints
- [ ] Verify audit trails (GenerationEvent, ReviewEvent) are populated
- [ ] Set up monitoring for LLM API usage
- [ ] Ensure GEMINI_API_KEY is securely stored

---

## CONCLUSION

The backend is **production-ready** with:
- ✅ Clear separation of concerns (12 routers, 5 services)
- ✅ Comprehensive audit trails (2 event models)
- ✅ Modern LLM integration (GeminiClient, google-genai)
- ✅ Sophisticated judge evaluation (8-dimensional rubric)
- ✅ Human-in-the-loop workflow support

However, address the **3 critical issues** (deprecated extraction, missing approval flow, inconsistent defaults) before full production deployment.

